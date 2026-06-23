import { Request, Response } from 'express'
import mongoose from 'mongoose'
import twilio from 'twilio'
import Call from '../models/Call'
import Client from '../models/Client'
import PaymentPromise from '../models/PaymentPromise'
import { findClientByPhone } from '../services/customerLookup.service'
import { generateVoiceResponse, analyzeCallTranscript, ConversationTurn, ClientInfo } from '../services/claudeVoice.service'

const { VoiceResponse } = twilio.twiml
const VOICE = 'Polly.Lupe-Neural' as const
const LANGUAGE = 'es-MX' as const

function cleanText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function getBaseUrl(req: Request): string {
  const host = req.headers['x-forwarded-host'] ?? req.get('host') ?? 'localhost:3002'
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https'
  return `${proto}://${host}`
}

function sayAndGather(message: string, callSid: string, baseUrl: string): string {
  const twiml = new VoiceResponse()
  const gatherUrl = `${baseUrl}/api/voice/gather`

  const gather = twiml.gather({
    input: ['speech'],
    action: `${gatherUrl}?callSid=${encodeURIComponent(callSid)}`,
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'experimental_conversations',
    hints: 'sí,no,bueno,claro,está bien,de acuerdo,espera,momento,no puedo,no tengo,ya pagué,mándeme,cuánto,cuándo,la próxima semana,el viernes,el lunes,mañana,quinientos,mil,dos mil,cinco mil,diez mil,transferencia,efectivo,depósito,tarjeta,OXXO',
    language: LANGUAGE,
    timeout: 10,
  })

  gather.say({ voice: VOICE, language: LANGUAGE }, cleanText(message))

  twiml.redirect({ method: 'POST' }, `${gatherUrl}?callSid=${encodeURIComponent(callSid)}&noInput=true`)

  return twiml.toString()
}

function sayAndHangup(message: string): string {
  const twiml = new VoiceResponse()
  twiml.say({ voice: VOICE, language: LANGUAGE }, cleanText(message))
  twiml.hangup()
  return twiml.toString()
}

function errorResponse(): string {
  const twiml = new VoiceResponse()
  twiml.say(
    { voice: VOICE, language: LANGUAGE },
    'Lo sentimos, tenemos un problema técnico. Por favor intente más tarde.'
  )
  twiml.hangup()
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

export async function handleIncoming(req: Request, res: Response): Promise<void> {
  const { CallSid, From, To } = req.body as { CallSid: string; From: string; To: string }
  const clientIdParam = req.query.clientId as string | undefined

  try {
    let clientInfo: ClientInfo | null = null
    let callerPhone: string

    if (clientIdParam) {
      callerPhone = To
      const client = await Client.findById(clientIdParam).lean()
      if (client) {
        clientInfo = {
          _id: client._id as mongoose.Types.ObjectId,
          name: client.name as string,
          debt: (client.debt as number) ?? 0,
          status: client.status as string,
          phone: client.phone as string,
        }
      }
    } else {
      callerPhone = From
      clientInfo = await findClientByPhone(From)
    }

    await Call.create({
      phone: callerPhone,
      clientId: clientInfo?._id ?? undefined,
      callSid: CallSid,
      transcript: [],
      status: 'in_progress',
      requiresHuman: false,
    })

    const agentResponse = await generateVoiceResponse([], clientInfo, callerPhone)

    await Call.findOneAndUpdate(
      { callSid: CallSid },
      {
        $push: {
          transcript: {
            role: 'assistant',
            content: agentResponse.message,
            timestamp: new Date(),
          },
        },
      }
    )

    res.type('text/xml').send(sayAndGather(agentResponse.message, CallSid, getBaseUrl(req)))
  } catch (err) {
    console.error('[Voice] handleIncoming error:', err)
    res.type('text/xml').send(errorResponse())
  }
}

export async function handleGather(req: Request, res: Response): Promise<void> {
  const { callSid, noInput } = req.query as { callSid: string; noInput?: string }
  const { SpeechResult } = req.body as { SpeechResult?: string }

  try {
    const call = await Call.findOne({ callSid }).populate('clientId')

    if (!call) {
      res.type('text/xml').send(errorResponse())
      return
    }

    // Handle no-input (silence)
    if (noInput === 'true' || !SpeechResult) {
      const silenceCount = call.transcript.filter(
        (t) => t.role === 'user' && t.content === '[silencio]'
      ).length
      const turnCount = call.transcript.length

      if (silenceCount >= 2) {
        call.status = 'completed'
        await call.save()
        res.type('text/xml').send(
          sayAndHangup('Gracias por su tiempo. Nos pondremos en contacto pronto. Hasta luego.')
        )
        return
      }

      const silenceMsg = turnCount <= 2
        ? '¿Hola? ¿Me puede escuchar bien?'
        : silenceCount === 0
          ? 'Tome su tiempo, estoy escuchándole.'
          : '¿Sigue ahí? No hay prisa, puede hablar cuando guste.'

      call.transcript.push({
        role: 'user',
        content: '[silencio]',
        timestamp: new Date(),
      })
      await call.save()
      res.type('text/xml').send(sayAndGather(silenceMsg, callSid, getBaseUrl(req)))
      return
    }

    // Build history including current user turn before saving to DB
    const userTurn: ConversationTurn = { role: 'user', content: SpeechResult }
    const history: ConversationTurn[] = [
      ...call.transcript.map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      userTurn,
    ]

    call.transcript.push({ role: 'user', content: SpeechResult, timestamp: new Date() })

    const populated = call.clientId as unknown as {
      _id: mongoose.Types.ObjectId
      name: string
      debt: number
      status: string
      phone: string
    } | null

    const clientInfo: ClientInfo | null = populated
      ? {
          _id: populated._id,
          name: populated.name,
          debt: populated.debt,
          status: populated.status,
          phone: populated.phone,
        }
      : null

    // Save user speech and call Claude in parallel
    const [, agentResponse] = await Promise.all([
      call.save(),
      generateVoiceResponse(history, clientInfo, call.phone),
    ])

    // Save agent response
    call.transcript.push({
      role: 'assistant',
      content: agentResponse.message,
      timestamp: new Date(),
    })

    if (agentResponse.intent === 'requires_human') {
      call.requiresHuman = true
      call.status = 'requires_human'
      await call.save()
      res.type('text/xml').send(
        sayAndHangup(
          agentResponse.message ||
            'En breve un asesor se pondrá en contacto contigo. Gracias por llamar.'
        )
      )
      return
    }

    if (agentResponse.intent === 'goodbye' || agentResponse.intent === 'promise_of_payment') {
      call.status = 'completed'
      await call.save()
      res.type('text/xml').send(sayAndHangup(agentResponse.message))
      return
    }

    await call.save()
    res.type('text/xml').send(sayAndGather(agentResponse.message, callSid, getBaseUrl(req)))
  } catch (err) {
    console.error('[Voice] handleGather error:', err)
    res.type('text/xml').send(errorResponse())
  }
}

export async function handleStatus(req: Request, res: Response): Promise<void> {
  const { CallSid, CallStatus } = req.body as { CallSid: string; CallStatus: string }

  try {
    if (['busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)) {
      await Call.findOneAndUpdate(
        { callSid: CallSid, status: 'in_progress' },
        { status: 'failed' }
      )
    } else if (CallStatus === 'completed') {
      // Mark still-in-progress calls as completed (calls that ended unexpectedly)
      await Call.findOneAndUpdate(
        { callSid: CallSid, status: 'in_progress' },
        { status: 'completed' }
      )

      // Post-call analysis: extract what was actually agreed from the full conversation
      const call = await Call.findOne({ callSid: CallSid, promiseDate: null })
      if (!call || !call.clientId) { res.sendStatus(200); return }

      const relevantTurns = call.transcript.filter(t => !t.content.startsWith('['))
      if (relevantTurns.length < 2) { res.sendStatus(200); return }

      const populated = await Client.findById(call.clientId).lean()
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
      console.log(`[Voice] Análisis post-llamada CallSid ${CallSid}:`, analysis.summary)

      if (analysis.hasAgreement && analysis.promises.length > 0) {
        await Promise.all(
          analysis.promises.map((p, i) =>
            PaymentPromise.create({
              clientId: call.clientId,
              amount: p.amount,
              promisedDate: new Date(p.promiseDate),
              notes: analysis.promises.length > 1
                ? `Cuota ${i + 1}/${analysis.promises.length} — ${analysis.summary}. CallSid: ${CallSid}`
                : `${analysis.summary}. CallSid: ${CallSid}`,
              detectedByAI: true,
              status: 'pending',
            })
          )
        )
        call.promiseDate = new Date(analysis.promises[0].promiseDate)
        call.amount = analysis.promises[0].amount
        await call.save()
        await Client.findByIdAndUpdate(call.clientId, { status: 'promised' })
        console.log(`[Voice] ${analysis.promises.length} promesa(s) registrada(s). CallSid: ${CallSid}`)
      }
    }
    res.sendStatus(200)
  } catch (err) {
    console.error('[Voice] handleStatus error:', err)
    res.sendStatus(500)
  }
}
