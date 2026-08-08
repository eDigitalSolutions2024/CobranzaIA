import { IncomingMessage } from 'http'
import WebSocket from 'ws'
import mongoose from 'mongoose'
import Call from '../models/Call'
import Client from '../models/Client'
import { runAction } from '../services/flowActions.service'
import { OpenAIRealtimeSession, RealtimeFunctionCall } from '../services/openaiRealtime.service'
import { buildVoiceSystemPrompt, ClientInfo } from '../services/voiceConversation.service'
import { normalizeRFC } from '../utils/rfc'

// Puente de audio Twilio <-> OpenAI Realtime. El modelo conversa libre (guiado por el
// prompt de voiceConversation.service.ts) y dispara las acciones de negocio
// (flowActions.service.ts) llamando a las funciones (tools) definidas en VOICE_TOOLS —
// ya no se parsean marcadores de texto del habla del agente, eso resultó poco confiable
// (el modelo a veces decía "voy a registrar esto" sin emitir el marcador real).
// A diferencia de la versión anterior basada en flowEngine.service.ts (máquina de estados
// que exigía coincidencias exactas de texto), esto tolera que la transcripción de voz no
// sea perfecta — si el modelo no entendió, simplemente vuelve a preguntar de forma natural.
export async function handleMediaStream(twilioWs: WebSocket, _req: IncomingMessage): Promise<void> {
  let streamSid: string | null = null
  let callDocId: mongoose.Types.ObjectId | null = null
  let isAgentSpeaking = false
  let shouldHangup = false
  // Cuando requerir_humano/finalizar_llamada disparan una respuesta nueva para la
  // despedida (ver handleFunctionCall), hay que colgar hasta que ESA respuesta termine,
  // no con el responseDone de la respuesta anterior (la que llamó a la función) — si no,
  // se corta la llamada antes de que alcance a decir la despedida.
  let awaitingHangupResponseCreation = false
  let hangupAfterResponseId: string | null = null
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

  session.on('responseCreated', (responseId) => {
    if (awaitingHangupResponseCreation) {
      hangupAfterResponseId = responseId
      awaitingHangupResponseCreation = false
    }
  })

  session.on('responseDone', (status, responseId) => {
    isAgentSpeaking = false
    if (status === 'cancelled' && streamSid && twilioWs.readyState === WebSocket.OPEN) {
      // Corta el audio ya en el buffer de Twilio para que no siga sonando la frase
      // que el servidor ya decidió cortar.
      twilioWs.send(JSON.stringify({ event: 'clear', streamSid }))
    }
    if (!shouldHangup) return
    if (hangupAfterResponseId) {
      // Ya sabemos cuál es la respuesta de despedida — solo colgamos con SU responseDone,
      // ignoramos el de la respuesta anterior (la que disparó la función) si llega después.
      if (responseId === hangupAfterResponseId) closeAll()
    } else if (!awaitingHangupResponseCreation) {
      // No se disparó ninguna respuesta extra de despedida — comportamiento anterior.
      closeAll()
    }
  })

  session.on('userTranscript', (text) => {
    if (!text || !callDocId) return
    Call.findByIdAndUpdate(callDocId, {
      $push: { transcript: { role: 'user', content: text, timestamp: new Date() } },
    }).catch((err) => console.error('[VoiceStream] Error guardando transcript de usuario:', err))
  })

  session.on('agentTranscript', (text) => {
    if (!text || !callDocId) return
    console.log(`[VoiceStream] agente dijo: "${text}"`)
    Call.findByIdAndUpdate(callDocId, {
      $push: { transcript: { role: 'assistant', content: text, timestamp: new Date() } },
    }).catch((err) => console.error('[VoiceStream] Error guardando transcript del agente:', err))
  })

  session.on('functionCall', (fnCall) => {
    handleFunctionCall(fnCall).catch((err) => {
      console.error('[VoiceStream] Error procesando llamada a función:', err)
    })
  })

  session.on('close', () => closeAll())

  async function handleFunctionCall({ name, callId, arguments: argsRaw }: RealtimeFunctionCall): Promise<void> {
    if (!callDocId) return
    console.log(`[VoiceStream] función llamada: ${name}(${argsRaw})`)

    let args: Record<string, any> = {}
    try {
      args = argsRaw ? JSON.parse(argsRaw) : {}
    } catch {
      args = {}
    }

    const call = await Call.findById(callDocId)
    if (!call) return

    switch (name) {
      case 'confirmar_identidad': {
        call.identityConfirmed = true
        await call.save()
        session.sendFunctionCallOutput(callId, { ok: true })
        session.createResponse()
        break
      }

      case 'marcar_ticket_aclaracion': {
        await runAction('crm', 'create_clarification_ticket', {}, call)
        session.sendFunctionCallOutput(callId, { ok: true })
        session.createResponse()
        break
      }

      case 'registrar_promesa_pago': {
        const ctx = { amount: args.monto, payment_date: args.fecha }
        await runAction('crm', 'create_payment_commitment', ctx, call)
        await runAction('crm', 'schedule_reminder', ctx, call)
        await runAction('whatsapp', 'send_payment_information', {}, call)
        session.sendFunctionCallOutput(callId, { ok: true })
        session.createResponse()
        break
      }

      case 'verificar_rfc': {
        // Comparación exacta hecha en el backend, no por criterio del modelo — a diferencia
        // del nombre (donde toleramos variaciones), un RFC parcial sí debe coincidir exacto.
        const clientForRfc = call.clientId ? await Client.findById(call.clientId).lean() : null
        const expected = clientForRfc?.rfc ? normalizeRFC(clientForRfc.rfc as string).slice(-4) : null
        const received = normalizeRFC(String(args.ultimos4 ?? ''))
        const matches = Boolean(expected) && received === expected
        session.sendFunctionCallOutput(callId, { matches })
        session.createResponse()
        return
      }

      case 'marcar_saldo_pagado': {
        // Corre en nuestro backend, no dentro del modelo — le regresamos el resultado
        // como salida de la función para que reaccione de forma natural en su siguiente turno.
        const result = await runAction('payments', 'verify_payment', {}, call)
        const exists = Boolean(result?.payment_exists)
        session.sendFunctionCallOutput(callId, { payment_exists: exists })
        session.createResponse()
        return
      }

      case 'requerir_humano': {
        call.requiresHuman = true
        call.status = 'requires_human'
        await call.save()
        if (call.clientId) {
          const motivo = typeof args.motivo === 'string' && args.motivo.trim() ? args.motivo.trim() : null
          await Client.findByIdAndUpdate(call.clientId, { requiresHuman: true, requiresHumanReason: motivo })
        }
        shouldHangup = true
        awaitingHangupResponseCreation = true
        session.sendFunctionCallOutput(callId, { ok: true })
        session.createResponse()
        break
      }

      case 'finalizar_llamada': {
        call.status = 'completed'
        await call.save()
        shouldHangup = true
        awaitingHangupResponseCreation = true
        session.sendFunctionCallOutput(callId, { ok: true })
        session.createResponse()
        break
      }

      case 'marcar_extension': {
        // TODO: aún no se envían tonos DTMF al conmutador, solo se registra la intención.
        session.sendFunctionCallOutput(callId, { ok: true })
        session.createResponse()
        break
      }

      default:
        session.sendFunctionCallOutput(callId, { ok: false, error: 'unknown_function' })
        session.createResponse()
        break
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
          rfc: (client.rfc as string) ?? null,
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
