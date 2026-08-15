import { Request, Response } from 'express'
import mongoose from 'mongoose'
import twilio from 'twilio'
import Call from '../models/Call'
import Client from '../models/Client'
import { findClientByPhone } from '../services/customerLookup.service'
import { analyzeCallTranscript, ClientInfo } from '../services/claudeVoice.service'

const { VoiceResponse } = twilio.twiml
const VOICE = 'Polly.Mia-Neural' as const
const LANGUAGE = 'es-MX' as const

// Sanitiza texto antes de mandarlo a hablar (a Polly como fallback, o como instrucción
// a la Realtime API de OpenAI en voiceStream.controller.ts).
export function cleanText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function getBaseUrl(req: Request): string {
  const host = req.headers['x-forwarded-host'] ?? req.get('host') ?? 'localhost:3003'
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https'
  return `${proto}://${host}`
}

function speakSegments(say: ReturnType<InstanceType<typeof VoiceResponse>['say']>, message: string): void {
  const sentences = cleanText(message)
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (sentences.length === 0) return

  sentences.forEach((sentence, i) => {
    say.s(sentence)
    if (i === 0 && sentences.length > 1) {
      say.break({ time: '200ms' })
    }
  })
}

// Fallback: solo se usa si no se pudo ni siquiera arrancar el puente hacia OpenAI
// Realtime (ej. falta OPENAI_API_KEY, o la llamada falla antes de conectar el stream).
// Número fijo del agente humano al que se avisa cuando un caso queda marcado
// REQUIERE_HUMANO — configurable por .env sin necesitar redeploy.
const HUMAN_AGENT_PHONE = process.env.HUMAN_AGENT_PHONE || '3319242792'

export function sayAndHangup(message: string): string {
  const twiml = new VoiceResponse()
  speakSegments(twiml.say({ voice: VOICE, language: LANGUAGE }, ''), message)
  twiml.hangup()
  return twiml.toString()
}

function errorResponse(): string {
  return sayAndHangup('Lo sentimos, tenemos un problema técnico. Por favor intente más tarde.')
}

// Entrega el control de la llamada al WebSocket de audio en tiempo real
// (voiceStream.controller.ts), que puentea Twilio <-> OpenAI Realtime API.
// El callSid no se manda por query string (Twilio no lo conserva de forma confiable
// ahí) — voiceStream.controller.ts lo obtiene del propio evento "start" del stream.
function connectStream(baseUrl: string): string {
  const twiml = new VoiceResponse()
  const wsUrl = baseUrl.replace(/^http/, 'ws')
  twiml.connect().stream({ url: `${wsUrl}/api/voice/stream` })
  return twiml.toString()
}

export async function getCalls(req: Request, res: Response): Promise<void> {
  try {
    const calls = await Call.find()
      .populate('clientId', 'name phone debt status')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    res.json(calls)
  } catch (err) {
    console.error('[Voice] getCalls error:', err)
    res.status(500).json({ error: 'Error al obtener llamadas' })
  }
}

export async function handleOutbound(req: Request, res: Response): Promise<void> {
  const { clientId } = req.body as { clientId: string }

  try {
    const client = await Client.findById(clientId).lean()
    if (!client) {
      res.status(404).json({ error: 'Cliente no encontrado' })
      return
    }

    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const publicUrl = (process.env.PUBLIC_URL ?? getBaseUrl(req)).replace(/\/$/, '')

    const rawPhone = client.phone as string
    const toPhone = rawPhone.startsWith('+') ? rawPhone : `+52${rawPhone.replace(/\D/g, '')}`

    const call = await twilioClient.calls.create({
      to: toPhone,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: `${publicUrl}/api/voice/incoming?clientId=${clientId}`,
      statusCallback: `${publicUrl}/api/voice/status`,
      statusCallbackMethod: 'POST',
    })

    res.json({ callSid: call.sid, status: call.status })
  } catch (err) {
    console.error('[Voice] handleOutbound error:', err)
    res.status(500).json({ error: 'Error al iniciar llamada' })
  }
}

// Llamada informativa (no bridging en vivo) al agente humano fijo — se dispara solo con
// el botón del dashboard, nunca automático. Lee los datos del caso con TTS y cuelga; el
// agente humano marca al cliente por su cuenta después de escuchar el aviso.
export async function handleNotifyHuman(req: Request, res: Response): Promise<void> {
  const { clientId } = req.body as { clientId: string }

  try {
    const client = await Client.findById(clientId)
    if (!client) {
      res.status(404).json({ error: 'Cliente no encontrado' })
      return
    }

    const reason = client.requiresHumanReason as string | null
    const reasonText = reason ? ` Motivo: ${reason}.` : ''
    const message = `Aviso del sistema de cobranza. El cliente ${client.name}, teléfono ${client.phone}, requiere atención de un agente humano.${reasonText}`

    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const toPhone = HUMAN_AGENT_PHONE.startsWith('+') ? HUMAN_AGENT_PHONE : `+52${HUMAN_AGENT_PHONE.replace(/\D/g, '')}`
    const publicUrl = (process.env.PUBLIC_URL ?? getBaseUrl(req)).replace(/\/$/, '')

    const call = await twilioClient.calls.create({
      to: toPhone,
      from: process.env.TWILIO_PHONE_NUMBER!,
      twiml: sayAndHangup(message),
      // Detecta si contestó una persona o un buzón de voz — no cambia lo que se dice,
      // solo nos deja ver en logs si el aviso realmente llegó a alguien en vivo.
      machineDetection: 'Enable',
      statusCallback: `${publicUrl}/api/voice/notify-human-status`,
      statusCallbackEvent: ['completed'],
      statusCallbackMethod: 'POST',
    })

    client.requiresHuman = false
    await client.save()

    res.json({ callSid: call.sid, status: call.status })
  } catch (err) {
    console.error('[Voice] handleNotifyHuman error:', err)
    res.status(500).json({ error: 'Error al notificar al agente' })
  }
}

// Webhook público de Twilio (statusCallback de handleNotifyHuman) — deja rastro en logs.
export async function handleNotifyHumanStatus(req: Request, res: Response): Promise<void> {
  const { CallSid, CallStatus, CallDuration, AnsweredBy } = req.body as Record<string, string>
  console.log(
    `[Voice] Aviso a agente humano CallSid=${CallSid} status=${CallStatus} duración=${CallDuration}s contestó=${AnsweredBy ?? 'desconocido'}`
  )
  res.sendStatus(200)
}

// El dashboard hace polling de esto tras lanzar el aviso, para mostrar en vivo si contestó
// el agente o cayó a buzón — se consulta directo a Twilio, no depende de que el webhook de
// arriba ya haya llegado.
export async function getNotifyHumanStatus(req: Request, res: Response): Promise<void> {
  const callSid = String(req.params.callSid)

  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const call = await twilioClient.calls(callSid).fetch()
    res.json({ status: call.status, answeredBy: call.answeredBy, duration: call.duration })
  } catch (err) {
    console.error('[Voice] getNotifyHumanStatus error:', err)
    res.status(500).json({ error: 'Error al consultar el estado de la llamada' })
  }
}

export async function handleIncoming(req: Request, res: Response): Promise<void> {
  const receivedAt = Date.now()
  const { CallSid, From, To } = req.body as { CallSid: string; From: string; To: string }
  const clientIdParam = req.query.clientId as string | undefined

  try {
    let clientId: mongoose.Types.ObjectId | undefined
    let callerPhone: string

    if (clientIdParam) {
      callerPhone = To
      const client = await Client.findById(clientIdParam).lean()
      if (client) clientId = client._id as mongoose.Types.ObjectId
    } else {
      callerPhone = From
      const found = await findClientByPhone(From)
      clientId = found?._id
    }

    // El agente conversa libre dentro del WebSocket de audio (voiceStream.controller.ts,
    // guiado por voiceConversation.service.ts) — aquí solo se registra la llamada.
    await Call.create({
      phone: callerPhone,
      clientId,
      callSid: CallSid,
      transcript: [],
      status: 'in_progress',
      requiresHuman: false,
    })

    console.log(`[Voice][latency] callSid=${CallSid} turn=start totalMs=${Date.now() - receivedAt}`)
    res.type('text/xml').send(connectStream(getBaseUrl(req)))
  } catch (err) {
    console.error('[Voice] handleIncoming error:', err)
    res.type('text/xml').send(errorResponse())
  }
}

export async function handleStatus(req: Request, res: Response): Promise<void> {
  const { CallSid, CallStatus, CallDuration } = req.body as { CallSid: string; CallStatus: string; CallDuration?: string }
  // CallDuration solo viene poblado en el statusCallback final (Twilio lo calcula al
  // colgar) — se guarda en cualquier status terminal, no solo 'completed'.
  const durationSeconds = CallDuration !== undefined ? Number(CallDuration) : null

  try {
    if (['busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)) {
      await Call.findOneAndUpdate(
        { callSid: CallSid, status: 'in_progress' },
        { status: 'failed', ...(durationSeconds !== null ? { durationSeconds } : {}) }
      )
    } else if (CallStatus === 'completed') {
      // Marca como completadas las llamadas que se cortaron a media conversación
      await Call.findOneAndUpdate(
        { callSid: CallSid, status: 'in_progress' },
        { status: 'completed', ...(durationSeconds !== null ? { durationSeconds } : {}) }
      )
      if (durationSeconds !== null) {
        await Call.findOneAndUpdate({ callSid: CallSid, status: { $ne: 'in_progress' } }, { durationSeconds })
      }

      // Resumen legible para el CRM. Ya no crea promesas de pago aquí: eso lo hace
      // voiceStream.controller.ts en vivo, en cuanto el agente marca PROMESA_PAGO.
      const call = await Call.findOne({ callSid: CallSid, summary: null })
      if (!call) {
        res.sendStatus(200)
        return
      }

      const relevantTurns = call.transcript.filter((t) => !t.content.startsWith('['))
      if (relevantTurns.length < 2) {
        res.sendStatus(200)
        return
      }

      const populated = call.clientId ? await Client.findById(call.clientId).lean() : null
      const clientInfo: ClientInfo | null = populated
        ? {
            _id: populated._id as mongoose.Types.ObjectId,
            name: populated.name as string,
            debt: (populated.debt as number) ?? 0,
            status: populated.status as string,
            phone: populated.phone as string,
          }
        : null

      const analysis = await analyzeCallTranscript(call.transcript, clientInfo)
      call.summary = analysis.summary
      call.claudeUsage = {
        inputTokens: analysis.usage.inputTokens,
        outputTokens: analysis.usage.outputTokens,
      }
      await call.save()
      console.log(`[Voice] Resumen post-llamada CallSid ${CallSid}: ${analysis.summary}`)
    }
    res.sendStatus(200)
  } catch (err) {
    console.error('[Voice] handleStatus error:', err)
    res.sendStatus(500)
  }
}
