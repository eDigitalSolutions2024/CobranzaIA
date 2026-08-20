import { Request, Response } from 'express'
import mongoose from 'mongoose'
import twilio from 'twilio'
import Call from '../models/Call'
import Client from '../models/Client'
import PaymentPromise from '../models/PaymentPromise'
import { findClientByPhone } from '../services/customerLookup.service'
import {
  generateVoiceResponse,
  analyzeCallTranscript,
  summarizeDroppedTurns,
  SUMMARIZE_AFTER_TURNS,
  ConversationTurn,
  ClientInfo,
} from '../services/claudeVoice.service'
import {
  createSession,
  getSession,
  pushTurn,
  setSummary,
  updateConversationContext,
  incrementSilence,
  deleteSession,
} from '../services/callSession.cache'
import { classifyIntent, detectEmotion } from '../services/intentClassifier'
import { transitionState } from '../services/conversationStateMachine'

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

    // Client lookup and DB create run in parallel
    let clientLookup: Promise<ClientInfo | null>

    if (clientIdParam) {
      callerPhone = To
      clientLookup = Client.findById(clientIdParam).lean().then((c) =>
        c
          ? {
              _id: c._id as mongoose.Types.ObjectId,
              name: c.name as string,
              debt: (c.debt as number) ?? 0,
              status: c.status as string,
              phone: c.phone as string,
            }
          : null
      )
    } else {
      callerPhone = From
      clientLookup = findClientByPhone(From)
    }

    const [resolvedClient] = await Promise.all([
      clientLookup,
      Call.create({
        phone: callerPhone,
        clientId: undefined,
        callSid: CallSid,
        transcript: [],
        status: 'in_progress',
        requiresHuman: false,
      }),
    ])

    clientInfo = resolvedClient

    // Patch clientId now that we have it
    if (clientInfo) {
      await Call.findOneAndUpdate({ callSid: CallSid }, { clientId: clientInfo._id })
    }

    const agentResponse = await generateVoiceResponse([], clientInfo, callerPhone)

    // Seed the in-memory session (avoids MongoDB read on every gather turn)
    createSession(CallSid, {
      clientInfo,
      phone: callerPhone,
      silenceCount: 0,
      history: [{ role: 'assistant', content: agentResponse.message }],
    })

    // Persist opening turn to DB (single write)
    await Call.findOneAndUpdate(
      { callSid: CallSid },
      {
        $push: {
          transcript: { role: 'assistant', content: agentResponse.message, timestamp: new Date() },
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
    // --- SILENCE HANDLING ---
    if (noInput === 'true' || !SpeechResult) {
      const silenceCount = incrementSilence(callSid)

      if (silenceCount >= 2) {
        deleteSession(callSid)
        await Call.findOneAndUpdate({ callSid }, { status: 'completed' })
        res.type('text/xml').send(
          sayAndHangup('Gracias por su tiempo. Nos pondremos en contacto pronto. Hasta luego.')
        )
        return
      }

      const session = getSession(callSid)
      const turnCount = session?.history.length ?? 0
      const silenceMsg =
        turnCount <= 2
          ? '¿Hola? ¿Me puede escuchar bien?'
          : silenceCount === 1
            ? 'Tome su tiempo, estoy escuchándole.'
            : '¿Sigue ahí? No hay prisa, puede hablar cuando guste.'

      // Only write silence to DB — no Claude call needed
      await Call.findOneAndUpdate(
        { callSid },
        { $push: { transcript: { role: 'user', content: '[silencio]', timestamp: new Date() } } }
      )

      res.type('text/xml').send(sayAndGather(silenceMsg, callSid, getBaseUrl(req)))
      return
    }

    // --- INTENT CLASSIFICATION (before Claude) ---
    const currentSession = getSession(callSid)
    const currentState = currentSession?.state ?? 'greeting'
    const { intent: localIntent, response: localResponse } = classifyIntent(SpeechResult, currentState)
    const clientEmotion = detectEmotion(SpeechResult, localIntent)

    if (localResponse !== null) {
      // Resolved locally — no LLM call needed
      console.log(`[Voice] Intent local: ${localIntent} (emoción: ${clientEmotion}) — omitiendo Claude`)

      const isFinal =
        localIntent !== 'backchannel' &&
        (localResponse.includes('FIN_LLAMADA') ||
          localResponse.includes('REQUIERE_HUMANO') ||
          localIntent === 'wants_human')

      const cleanMsg = localResponse
        .replace(/FIN_LLAMADA/g, '')
        .replace(/REQUIERE_HUMANO/g, '')
        .trim()

      const transcriptPush = [
        { role: 'user' as const, content: SpeechResult, timestamp: new Date() },
        { role: 'assistant' as const, content: cleanMsg, timestamp: new Date() },
      ]

      if (isFinal) {
        deleteSession(callSid)
        const updateFields: Record<string, unknown> = {
          status: localIntent === 'wants_human' ? 'requires_human' : 'completed',
          requiresHuman: localIntent === 'wants_human',
        }
        await Call.findOneAndUpdate({ callSid }, {
          $push: { transcript: { $each: transcriptPush } },
          $set: updateFields,
        })
        res.type('text/xml').send(sayAndHangup(cleanMsg))
      } else {
        // Backchannel: update in-memory and respond immediately (no DB write for speed)
        if (currentSession) {
          pushTurn(callSid, { role: 'user', content: SpeechResult })
          pushTurn(callSid, { role: 'assistant', content: cleanMsg })
        }
        res.type('text/xml').send(sayAndGather(cleanMsg, callSid, getBaseUrl(req)))
      }
      return
    }

    // --- CLAUDE PATH ---
    // currentSession was already read above during intent classification

    // Build history from cache (avoids MongoDB read)
    const userTurn: ConversationTurn = { role: 'user', content: SpeechResult }
    let history: ConversationTurn[]
    let clientInfo: ClientInfo | null = null

    if (currentSession) {
      history = [...currentSession.history, userTurn]
      clientInfo = currentSession.clientInfo
    } else {
      // Fallback: load from DB if session was lost (server restart, etc.)
      const call = await Call.findOne({ callSid }).populate('clientId')
      if (!call) {
        res.type('text/xml').send(errorResponse())
        return
      }
      const populated = call.clientId as unknown as {
        _id: mongoose.Types.ObjectId; name: string; debt: number; status: string; phone: string
      } | null
      clientInfo = populated
        ? { _id: populated._id, name: populated.name, debt: populated.debt, status: populated.status, phone: populated.phone }
        : null
      history = [
        ...call.transcript.map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        userTurn,
      ]
    }

    // DB write and Claude call in parallel
    const dbPush = Call.findOneAndUpdate(
      { callSid },
      { $push: { transcript: { role: 'user', content: SpeechResult, timestamp: new Date() } } }
    )

    const phone = currentSession?.phone ?? ''
    const currentSummary = currentSession?.summary ?? null

    // Update emotion in session before calling Claude so the prompt reflects it
    updateConversationContext(callSid, currentState, clientEmotion)

    const [, agentResponse] = await Promise.all([
      dbPush,
      generateVoiceResponse(history, clientInfo, phone, currentSummary, currentState, clientEmotion),
    ])

    // Update in-memory session with both turns
    pushTurn(callSid, userTurn)
    pushTurn(callSid, { role: 'assistant', content: agentResponse.message })

    // Transition conversation state based on what just happened
    const updatedSession = getSession(callSid)
    const nextState = transitionState({
      current: currentState,
      agentIntent: agentResponse.intent,
      clientIntent: localIntent,
      turnCount: updatedSession?.history.length ?? 0,
    })
    if (nextState !== currentState) {
      console.log(`[Voice] Estado: ${currentState} → ${nextState} (${callSid})`)
    }
    updateConversationContext(callSid, nextState, clientEmotion)

    // Trigger summarization once when the call reaches SUMMARIZE_AFTER_TURNS.
    // Fire-and-forget: does not block the response to Twilio.
    if (updatedSession && updatedSession.history.length === SUMMARIZE_AFTER_TURNS && !updatedSession.summary) {
      const turnsToSummarize = updatedSession.history.slice(0, 4)
      summarizeDroppedTurns(turnsToSummarize)
        .then((s) => { if (s) { setSummary(callSid, s); console.log(`[Voice] Resumen generado ${callSid}: ${s}`) } })
        .catch((err) => console.warn('[Voice] Error generando resumen:', err))
    }

    // Single DB write for assistant turn + any status change
    const transcriptEntry = { role: 'assistant' as const, content: agentResponse.message, timestamp: new Date() }

    if (agentResponse.intent === 'requires_human') {
      deleteSession(callSid)
      await Call.findOneAndUpdate(
        { callSid },
        {
          $push: { transcript: transcriptEntry },
          $set: { requiresHuman: true, status: 'requires_human' },
        }
      )
      res.type('text/xml').send(
        sayAndHangup(
          agentResponse.message || 'En breve un asesor se pondrá en contacto contigo. Gracias.'
        )
      )
      return
    }

    if (agentResponse.intent === 'goodbye' || agentResponse.intent === 'promise_of_payment') {
      deleteSession(callSid)
      await Call.findOneAndUpdate(
        { callSid },
        {
          $push: { transcript: transcriptEntry },
          $set: { status: 'completed' },
        }
      )
      res.type('text/xml').send(sayAndHangup(agentResponse.message))
      return
    }

    // Continuing conversation
    await Call.findOneAndUpdate(
      { callSid },
      { $push: { transcript: transcriptEntry } }
    )

    res.type('text/xml').send(sayAndGather(agentResponse.message, callSid, getBaseUrl(req)))
  } catch (err) {
    console.error('[Voice] handleGather error:', err)
    res.type('text/xml').send(errorResponse())
  }
}

export async function handleStatus(req: Request, res: Response): Promise<void> {
  const { CallSid, CallStatus } = req.body as { CallSid: string; CallStatus: string }

  // Always respond to Twilio immediately — analysis runs in background
  res.sendStatus(200)

  try {
    if (['busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)) {
      await Call.findOneAndUpdate(
        { callSid: CallSid, status: 'in_progress' },
        { status: 'failed' }
      )
      deleteSession(CallSid)
      return
    }

    if (CallStatus === 'completed') {
      deleteSession(CallSid)
      await Call.findOneAndUpdate(
        { callSid: CallSid, status: 'in_progress' },
        { status: 'completed' }
      )

      // Background analysis — does NOT block Twilio webhook
      const call = await Call.findOne({ callSid: CallSid, promiseDate: null })
      if (!call?.clientId) return

      const relevantTurns = call.transcript.filter((t) => !t.content.startsWith('['))
      if (relevantTurns.length < 2) return

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

      // Fire-and-forget — Twilio already received 200
      analyzeCallTranscript(call.transcript, clientInfo)
        .then(async (analysis) => {
          console.log(`[Voice] Análisis post-llamada ${CallSid}:`, analysis.summary)

          if (analysis.hasAgreement && analysis.promises.length > 0) {
            await Promise.all(
              analysis.promises.map((p, i) =>
                PaymentPromise.create({
                  clientId: call.clientId,
                  amount: p.amount,
                  promisedDate: new Date(p.promiseDate),
                  notes:
                    analysis.promises.length > 1
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
            console.log(`[Voice] ${analysis.promises.length} promesa(s) registrada(s). ${CallSid}`)
          }
        })
        .catch((err) => console.error('[Voice] Error en análisis background:', err))
    }
  } catch (err) {
    console.error('[Voice] handleStatus error:', err)
  }
}
