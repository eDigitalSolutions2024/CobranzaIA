import { IncomingMessage } from 'http'
import WebSocket from 'ws'
import mongoose from 'mongoose'
import Call from '../models/Call'
import Client from '../models/Client'
import { runAction } from '../services/flowActions.service'
import { OpenAIRealtimeSession } from '../services/openaiRealtime.service'
import { buildVoiceSystemPrompt, parseMarkers, ClientInfo } from '../services/voiceConversation.service'

// Puente de audio Twilio <-> OpenAI Realtime. El modelo conversa libre (guiado por el
// prompt de voiceConversation.service.ts) — nosotros solo leemos los marcadores que deja
// al final de lo que dice para disparar las acciones de negocio (flowActions.service.ts).
// A diferencia de la versión anterior basada en flowEngine.service.ts (máquina de estados
// que exigía coincidencias exactas de texto), esto tolera que la transcripción de voz no
// sea perfecta — si el modelo no entendió, simplemente vuelve a preguntar de forma natural.
export async function handleMediaStream(twilioWs: WebSocket, _req: IncomingMessage): Promise<void> {
  let streamSid: string | null = null
  let callDocId: mongoose.Types.ObjectId | null = null
  let isAgentSpeaking = false
  let shouldHangup = false
  let ready = false
  let closed = false
  const pendingAudio: string[] = []

  const session = new OpenAIRealtimeSession()

  function closeAll(): void {
    if (closed) return
    closed = true
    session.close()
    try {
      twilioWs.close()
    } catch {
      // ya pudo estar cerrado por el lado de Twilio
    }
  }

  session.on('error', (err) => {
    console.error('[VoiceStream] Error de OpenAI Realtime:', err)
  })

  session.on('audio', (payload) => {
    if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) return
    isAgentSpeaking = true
    twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
  })

  // Con create_response:true, el propio servidor de OpenAI decide cuándo el cliente
  // empezó a hablar de verdad y cancela su respuesta en curso solo (responseDone llega
  // con status:"cancelled") — no hay que pedirle cancelar nosotros también, eso es lo
  // que causaba el error "no active response found" (cancelación duplicada).
  session.on('speechStarted', () => {
    isAgentSpeaking = false
  })

  session.on('responseDone', (status) => {
    isAgentSpeaking = false
    if (status === 'cancelled' && streamSid && twilioWs.readyState === WebSocket.OPEN) {
      // Corta el audio ya en el buffer de Twilio para que no siga sonando la frase
      // que el servidor ya decidió cortar.
      twilioWs.send(JSON.stringify({ event: 'clear', streamSid }))
    }
    if (shouldHangup) closeAll()
  })

  session.on('userTranscript', (text) => {
    if (!text || !callDocId) return
    Call.findByIdAndUpdate(callDocId, {
      $push: { transcript: { role: 'user', content: text, timestamp: new Date() } },
    }).catch((err) => console.error('[VoiceStream] Error guardando transcript de usuario:', err))
  })

  session.on('agentTranscript', (text) => {
    if (!text) return
    handleAgentTurn(text).catch((err) => {
      console.error('[VoiceStream] Error procesando turno del agente:', err)
    })
  })

  session.on('close', () => closeAll())

  async function handleAgentTurn(rawText: string): Promise<void> {
    if (!callDocId) return
    const markers = parseMarkers(rawText)
    console.log(`[VoiceStream] agente dijo: "${rawText}"`)

    const call = await Call.findById(callDocId)
    if (!call) return

    call.transcript.push({ role: 'assistant', content: markers.cleanMessage || rawText, timestamp: new Date() })
    await call.save()

    if (markers.ticketAclaracion) {
      await runAction('crm', 'create_clarification_ticket', {}, call)
    }

    if (markers.promises.length > 0) {
      for (const p of markers.promises) {
        const ctx = { amount: p.amount, payment_date: p.paymentDate }
        await runAction('crm', 'create_payment_commitment', ctx, call)
        await runAction('crm', 'schedule_reminder', ctx, call)
      }
      await runAction('whatsapp', 'send_payment_information', {}, call)
    }

    if (markers.saldoYaPagado) {
      // verify_payment corre en nuestro backend, no dentro del modelo — le regresamos
      // el resultado como nota de sistema para que reaccione de forma natural.
      const result = await runAction('payments', 'verify_payment', {}, call)
      const exists = Boolean(result?.payment_exists)
      session.injectSystemNote(
        exists
          ? 'Se confirmó el pago en el sistema. Agradécele y cierra la llamada con cortesía, marca FIN_LLAMADA.'
          : 'No se encontró ningún pago registrado en el sistema. Pídele que mande su comprobante por WhatsApp y cierra la llamada, marca FIN_LLAMADA.'
      )
      return
    }

    if (markers.requiresHuman) {
      call.requiresHuman = true
      call.status = 'requires_human'
      await call.save()
      shouldHangup = true
    } else if (markers.finLlamada) {
      call.status = 'completed'
      await call.save()
      shouldHangup = true
    }
  }

  async function initialize(callSid: string): Promise<void> {
    const call = await Call.findOne({ callSid })
    if (!call) {
      console.error(`[VoiceStream] No se encontró Call para callSid=${callSid}`)
      closeAll()
      return
    }
    callDocId = call._id as mongoose.Types.ObjectId

    const client = call.clientId ? await Client.findById(call.clientId).lean() : null
    const clientInfo: ClientInfo | null = client
      ? {
          name: client.name as string,
          debt: (client.debt as number) ?? 0,
          agingDays: (client.agingDays as number) ?? 0,
          status: client.status as string,
        }
      : null

    const systemPrompt = buildVoiceSystemPrompt(clientInfo, call.phone)

    try {
      await session.connect(systemPrompt)
    } catch (err) {
      console.error('[VoiceStream] No se pudo conectar a OpenAI Realtime:', err)
      closeAll()
      return
    }

    if (closed) return

    ready = true
    for (const payload of pendingAudio.splice(0)) session.appendAudio(payload)

    // El agente habla primero al contestar, no espera a que el cliente diga algo.
    session.triggerGreeting()
  }

  twilioWs.on('message', (raw: WebSocket.RawData) => {
    let event: any
    try {
      event = JSON.parse(raw.toString())
    } catch {
      return
    }

    switch (event.event) {
      case 'start': {
        streamSid = event.start?.streamSid ?? null
        const callSid = event.start?.callSid ?? null
        console.log(`[VoiceStream] Stream iniciado streamSid=${streamSid} callSid=${callSid}`)

        if (!callSid) {
          console.error('[VoiceStream] Evento start sin callSid, cerrando')
          closeAll()
          break
        }

        initialize(callSid).catch((err) => {
          console.error('[VoiceStream] Error inicializando sesión:', err)
          closeAll()
        })
        break
      }

      case 'media':
        if (event.media?.payload) {
          if (ready) session.appendAudio(event.media.payload)
          else pendingAudio.push(event.media.payload)
        }
        break

      case 'stop':
        console.log('[VoiceStream] Stream detenido')
        closeAll()
        break

      default:
        break
    }
  })

  twilioWs.on('close', () => closeAll())
  twilioWs.on('error', (err) => {
    console.error('[VoiceStream] Error en WebSocket de Twilio:', err)
    closeAll()
  })
}
