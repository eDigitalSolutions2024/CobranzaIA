// Puente de audio Twilio <-> Deepgram (STT) + Claude (conversación) + ElevenLabs (TTS) —
// motor alterno al de producción (voiceStream.controller.ts, OpenAI Realtime). Se elige
// para las llamadas AUTOMÁTICAS con AutomationSettings.voiceEngine (ver
// autoCallScheduler.service.ts); el botón "Test ElevenLabs" siempre lo usa.
//
// Paridad con voiceStream.controller.ts en lo que necesita el ciclo automático: mismo
// marcado (placeOutboundCall, con extensión de conmutador y grabación), mismas tools y
// prompt (voiceConversation.service.ts), conmutador (marcar_extension + remarcado),
// buzón de voz (detectedVoicemail), métricas de tiempo y uso de tokens de Claude.
// Diferencias conocidas: el costo de Deepgram/ElevenLabs no se registra en Usage, y las
// llamadas ENTRANTES (inbound) no buscan al cliente por teléfono.
//
// El nombre de este archivo/rutas ("Cartesia") quedó del plan original — se cambió a
// ElevenLabs como TTS porque el registro en Cartesia estaba fallando el día de la
// prueba (ver cartesiaTts.service.ts, que queda sin usar por ahora). No vale la pena
// renombrar todo bajo presión de tiempo; el nombre es solo el codename del piloto.
import { IncomingMessage } from 'http'
import { Request, Response } from 'express'
import WebSocket from 'ws'
import mongoose from 'mongoose'
import twilio from 'twilio'
import Call from '../models/Call'
import Client from '../models/Client'
import { runAction } from '../services/flowActions.service'
import { DeepgramSttSession } from '../services/deepgramStt.service'
import { ElevenLabsTtsSession } from '../services/elevenLabsTts.service'
import { normalizeRFC } from '../utils/rfc'
import { loadInvoiceSummary } from '../services/invoiceSummary.service'
import { warmUpClaude, generateLiveVoiceTurn, LiveTurn, LiveToolCall, ToolOutcome } from '../services/claudeVoiceLive.service'
import { ClientInfo } from '../services/voiceConversation.service'
import { placeOutboundCall } from './voice.controller'

const { VoiceResponse } = twilio.twiml

// Audio mulaw 8kHz mono = 8 bytes/ms — mismo cálculo que BYTES_PER_MS en
// voiceStream.controller.ts, para saber cuánto le falta a Twilio por reproducir antes de
// colgar (evita cortar la despedida a media frase).
const BYTES_PER_MS = 8

export function connectStreamCartesia(baseUrl: string): string {
  const twiml = new VoiceResponse()
  const wsUrl = baseUrl.replace(/^http/, 'ws')
  twiml.connect().stream({ url: `${wsUrl}/api/voice/stream-cartesia` })
  return twiml.toString()
}

function errorResponseCartesia(): string {
  const twiml = new VoiceResponse()
  twiml.say({ voice: 'Polly.Mia-Neural', language: 'es-MX' }, 'Lo sentimos, tenemos un problema técnico. Por favor intente más tarde.')
  twiml.hangup()
  return twiml.toString()
}

function getBaseUrl(req: Request): string {
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost:3003'
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https'
  return `${proto}://${host}`
}

// Endpoint con auth (a diferencia del webhook de Twilio) — botón "Test ElevenLabs" del
// dashboard. Usa placeOutboundCall (voice.controller.ts) con engine 'elevenlabs', el
// MISMO camino que el ciclo automático cuando el motor está en ElevenLabs — así lo que se
// prueba aquí (extensión de conmutador, grabación, límite de tiempo) es lo que corre en
// automático.
export async function handleOutboundCartesia(req: Request, res: Response): Promise<void> {
  const { clientId } = req.body as { clientId: string }
  try {
    const publicUrl = (process.env.PUBLIC_URL ?? getBaseUrl(req)).replace(/\/$/, '')
    const result = await placeOutboundCall(clientId, publicUrl, 'manual', 'elevenlabs')
    res.json(result)
  } catch (err: any) {
    console.error('[VoiceCartesia] handleOutboundCartesia error:', err)
    if (err.message === 'Cliente no encontrado') {
      res.status(404).json({ error: 'Cliente no encontrado' })
      return
    }
    res.status(500).json({ error: 'Error al iniciar llamada de prueba' })
  }
}

export async function handleIncomingCartesia(req: Request, res: Response): Promise<void> {
  const clientIdParam = req.query.clientId as string | undefined

  try {
    if (clientIdParam) {
      // Outbound: el Call ya se creó en placeOutboundCall, antes de que Twilio
      // conteste — mismo motivo que placeOutboundCall en voice.controller.ts (si nadie
      // contesta, este webhook nunca llega).
    } else {
      // Inbound real — no es el camino esperado del piloto de hoy (se prueba con
      // llamadas salientes), pero se deja resuelto por si se marca directo al número de
      // Twilio durante la prueba.
      const { CallSid, From } = req.body as { CallSid: string; From: string }
      await Call.create({
        phone: From,
        callSid: CallSid,
        transcript: [],
        status: 'in_progress',
        requiresHuman: false,
        triggeredBy: 'manual',
      })
    }

    res.type('text/xml').send(connectStreamCartesia(getBaseUrl(req)))
  } catch (err) {
    console.error('[VoiceCartesia] handleIncomingCartesia error:', err)
    res.type('text/xml').send(errorResponseCartesia())
  }
}

const VOICEMAIL_PATTERN = /buz[oó]n de voz|grabe su mensaje|deje su mensaje|despu[eé]s del tono|no est[aá] disponible|fuera del [aá]rea de servicio|el n[uú]mero que usted marc[oó]/i

// `name` es la EMPRESA, nunca una persona — con `contact` (el responsable) el saludo se
// dirige a esa persona y menciona la empresa aparte, igual que en buildVoiceSystemPrompt
// (voiceConversation.service.ts) — mismo texto, para que el saludo fijo de este piloto no
// se desalinee del guion que sigue Claude en el resto de la llamada.
function buildGreeting(name: string, contact?: string | null): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(new Date())) % 24
  const salutation = hour < 12 ? 'buenos días' : hour < 19 ? 'buenas tardes' : 'buenas noches'
  const who = contact?.trim() ? `${contact.trim()}, de ${name}` : name
  return `Hola, ${salutation}, soy Guadalupe Martínez, asistente virtual de HP Financial Services. ¿Tengo el gusto de hablar con ${who}?`
}

export async function handleMediaStreamCartesia(twilioWs: WebSocket, _req: IncomingMessage): Promise<void> {
  let streamSid: string | null = null
  let callDocId: mongoose.Types.ObjectId | null = null
  let clientInfo: ClientInfo | null = null
  let phone = ''
  let closed = false
  let ready = false
  let processingTurn = false
  let shouldHangup = false
  let agentSpeaking = false
  let currentContextId: string | null = null
  let queueDrainCompleteAt = 0
  const pendingAudio: string[] = []
  const history: LiveTurn[] = []
  let utteranceBuffer = ''
  let queuedUserText = ''
  let turnStartedAt = 0
  let firstAudioLogged = false
  let turnAudioMs = 0
  let stageDepth = 0
  // --- Métricas de tiempo del flujo (para el modal de la llamada, ver CallTimeline.tsx)
  // — mismo concepto que voiceStream.controller.ts (producción), adaptado a este pipeline.
  // Este piloto nunca las grabó (se agregó después de esa instrumentación en producción),
  // por eso el modal se veía sin los contadores/píldoras de función en llamadas del piloto.
  let callStartAt: number | null = null
  let lastTurnEndAt: number | null = null
  let currentUserSpeechStartAt: number | null = null
  // Texto del turno del agente ya guardado en `history` (para que Claude lo vea de
  // inmediato) pero cuyo timing todavía no se escribe a Mongo — se hace hasta
  // tts.on('done') porque solo ahí se conoce durationMs real (audio ya completo), igual
  // que responseDone en el pipeline de producción. Si el turno se cancela (barge-in),
  // tts.on('done') nunca llega para ese contexto y este valor simplemente se sobreescribe
  // en el siguiente turno — la entrada cancelada nunca se guarda, que es lo correcto.
  let pendingAssistantText: string | null = null
  let consecutiveFailures = 0
  let deepgramReconnects = 0
  const executedOnce = new Set<string>()
  const registeredPromises = new Set<string>()
  const ONCE_ONLY_TOOLS = new Set(['confirmar_identidad', 'marcar_ticket_aclaracion', 'marcar_factura_no_recibida', 'marcar_pago_domiciliado', 'marcar_pago_en_proceso', 'marcar_negativa_pago'])

  const deepgram = new DeepgramSttSession()
  const tts = new ElevenLabsTtsSession()

  function closeAll(): void {
    if (closed) return
    closed = true
    deepgram.close()
    tts.close()
    try {
      twilioWs.close()
    } catch {
      // Twilio ya pudo haber cerrado su lado
    }
  }

  function sendClearToTwilio(): void {
    if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify({ event: 'clear', streamSid }))
    }
    queueDrainCompleteAt = Date.now()
  }

  tts.on('audio', (base64Payload, contextId) => {
    // Audio de un turno que ya se canceló (barge-in) — se descarta.
    if (contextId !== currentContextId) return
    if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) return
    agentSpeaking = true
    if (!firstAudioLogged) {
      firstAudioLogged = true
      turnAudioMs = 0
      console.log(`[VoiceCartesia] +${Date.now() - turnStartedAt}ms primer audio enviado a Twilio`)
    } else if (Date.now() - queueDrainCompleteAt > 80) {
      // El audio llegó cuando Twilio ya había reproducido todo lo anterior: el cliente
      // oyó esta pausa a media respuesta.
      console.log(`[VoiceCartesia] PAUSA de audio de ${Date.now() - queueDrainCompleteAt}ms a mitad del turno (+${Date.now() - turnStartedAt}ms)`)
    }
    const chunkMs = Buffer.from(base64Payload, 'base64').length / BYTES_PER_MS
    turnAudioMs += chunkMs
    queueDrainCompleteAt = Math.max(Date.now(), queueDrainCompleteAt) + chunkMs
    twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: base64Payload } }))
  })

  tts.on('done', (contextId) => {
    if (contextId !== currentContextId) return
    agentSpeaking = false
    console.log(`[VoiceCartesia] Turno de voz terminado: ${Math.round(turnAudioMs)}ms de audio en total`)

    // Recién aquí se conoce durationMs real (todo el audio de este turno ya se generó y
    // se mandó a Twilio) — ver comentario de pendingAssistantText arriba.
    if (callDocId && pendingAssistantText) {
      const text = pendingAssistantText
      pendingAssistantText = null
      const messageStartAt = turnStartedAt || Date.now()
      const latencyMs = lastTurnEndAt !== null ? Math.max(0, Math.round(messageStartAt - lastTurnEndAt)) : null
      const durationMs = turnAudioMs > 0 ? Math.round(turnAudioMs) : null
      const elapsedMs = callStartAt !== null ? Math.max(0, Math.round(messageStartAt - callStartAt)) : null
      Call.findByIdAndUpdate(callDocId, {
        $push: { transcript: { role: 'assistant', content: text, timestamp: new Date(), elapsedMs, latencyMs, durationMs } },
      }).catch((err) => console.error('[VoiceCartesia] Error guardando transcript del agente:', err))
      lastTurnEndAt = messageStartAt + (turnAudioMs > 0 ? turnAudioMs : 0)
    }

    if (shouldHangup) {
      const backlogMs = Math.max(0, queueDrainCompleteAt - Date.now())
      setTimeout(() => closeAll(), backlogMs + 300)
    } else if (queuedUserText && !closed) {
      // Texto que llegó mientras se hablaba (ver deepgram.on('transcript') arriba) y no
      // ameritó barge-in — recién ahora que terminó de sonar se procesa como turno normal.
      const next = queuedUserText
      queuedUserText = ''
      runTurn(next).catch((err) => console.error('[VoiceCartesia] Error procesando turno encolado:', err))
    }
  })

  tts.on('error', (err) => console.error('[VoiceCartesia] Error de ElevenLabs TTS:', err))

  // Solo para medir "cuánto tardó el cliente en empezar a contestar" (latencyMs) — a
  // diferencia del barge-in de abajo, aquí SÍ sirve el evento crudo de VAD de Deepgram
  // (no hace falta esperar 2+ palabras para saber que alguien empezó a hablar).
  deepgram.on('speechStarted', () => {
    currentUserSpeechStartAt = Date.now()
  })

  // Guarda el turno del cliente con su timing (elapsedMs/latencyMs, ver CallTimeline.tsx)
  // y avanza lastTurnEndAt — mismo criterio que voiceStream.controller.ts: el cliente ya
  // terminó de hablar en cuanto Deepgram cierra el enunciado, así que lastTurnEndAt se
  // ancla a "ahora", no a currentUserSpeechStartAt (eso es solo para latencyMs).
  function pushUserTranscript(text: string): void {
    if (!callDocId) return
    const messageStartAt = currentUserSpeechStartAt ?? Date.now()
    const latencyMs = lastTurnEndAt !== null ? Math.max(0, Math.round(messageStartAt - lastTurnEndAt)) : null
    const elapsedMs = callStartAt !== null ? Math.max(0, Math.round(messageStartAt - callStartAt)) : null
    currentUserSpeechStartAt = null
    lastTurnEndAt = Date.now()
    Call.findByIdAndUpdate(callDocId, {
      $push: { transcript: { role: 'user', content: text, timestamp: new Date(), elapsedMs, latencyMs } },
    }).catch((err) => console.error('[VoiceCartesia] Error guardando transcript:', err))
  }

  // Barge-in por PALABRAS reales (interim con 2+ palabras), no por el evento SpeechStarted de
  // Deepgram: ese se dispara con cualquier ruido (tos, eco de la línea, "mjm") y cancelaba
  // la voz del agente a media frase — visto en la prueba real, la llamada se quedaba muda.
  // Nunca se interrumpe una despedida (shouldHangup).
  deepgram.on('interim', (text) => {
    if (!agentSpeaking || !currentContextId || shouldHangup) return
    if (text.trim().split(/\s+/).length < 2) return
    console.log(`[VoiceCartesia] Barge-in por: "${text}"`)
    tts.cancel(currentContextId)
    sendClearToTwilio()
    agentSpeaking = false
  })

  deepgram.on('transcript', (text, isFinal) => {
    if (!text) return
    if (!isFinal) return
    console.log(`[VoiceCartesia] Cliente dijo: "${text}"`)
    utteranceBuffer = utteranceBuffer ? `${utteranceBuffer} ${text}` : text
    const finishedUtterance = utteranceBuffer
    utteranceBuffer = ''
    // Buzón de voz / contestadora: no tiene caso hablarle (ni pagar Claude y voz por ello).
    if (history.length <= 3 && VOICEMAIL_PATTERN.test(finishedUtterance)) {
      console.log('[VoiceCartesia] Buzón de voz detectado, terminando llamada')
      pushUserTranscript(finishedUtterance)
      // Señal directa (igual que voiceStream.controller.ts): handleStatus la usa para
      // clasificar 'Voice mail' y reintentar en el ciclo automático, en vez de contarlo
      // como conversación real.
      markVoicemail()
      closeAll()
      return
    }
    if (tryFastIdentityConfirmation(finishedUtterance)) return

    // El agente sigue hablando (audio en curso) y esto no bastó para disparar el barge-in
    // de arriba (menos de 2 palabras en el interim, ej. "bueno"/"aló"/muletillas) — no fue
    // una interrupción real. Si de todos modos se llamara a runTurn() aquí, tts.beginTurn()
    // pisaría currentContextId y el audio que ElevenLabs todavía está mandando de la
    // respuesta en curso se descartaría en silencio (se corta a medias sin que nadie mande
    // 'clear' a Twilio) — visto en prueba real: el saludo se cortaba y el agente volvía a
    // preguntar como si "bueno" hubiera interrumpido algo. En vez de eso se encola (mismo
    // mecanismo que ya existía para cuando Claude seguía generando) y se procesa en
    // tts.on('done') de abajo, una vez que termine de hablar.
    if (agentSpeaking) {
      queuedUserText = queuedUserText ? `${queuedUserText} ${finishedUtterance}` : finishedUtterance
      console.log(`[VoiceCartesia] Transcript en cola (agente hablando, no fue barge-in): "${finishedUtterance}"`)
      return
    }
    runTurn(finishedUtterance).catch((err) => console.error('[VoiceCartesia] Error procesando turno:', err))
  })

  deepgram.on('error', (err) => console.error('[VoiceCartesia] Error de Deepgram STT:', err))

  // Si Deepgram se cae a media llamada el agente quedaría sordo sin que nadie lo note:
  // se reconecta (máx. 2 veces) y, si no se logra, se termina la llamada.
  deepgram.on('close', () => {
    if (closed || !ready) return
    if (deepgramReconnects >= 2) {
      console.error('[VoiceCartesia] Deepgram no se pudo reconectar, terminando llamada')
      closeAll()
      return
    }
    deepgramReconnects++
    console.error(`[VoiceCartesia] Deepgram se desconectó a media llamada, reconectando (${deepgramReconnects}/2)`)
    deepgram.connect().catch(() => closeAll())
  })

  // Camino rápido del turno que más se nota: el "sí, soy yo" tras el saludo. La respuesta
  // del guion es siempre la misma, así que se habla directo (~0.5s) en vez de esperar a
  // Claude (0.8-1.8s medidos). Solo aplica con un sí inequívoco y sin RFC de por medio;
  // cualquier otra cosa (duda, pregunta, "¿quién habla?") sigue el camino normal con Claude.
  const YES_WORDS = new Set(['si', 'soy', 'yo', 'asi', 'es', 'claro', 'correcto', 'exacto', 'efectivamente', 'aqui', 'estoy', 'con', 'el', 'ella', 'mismo', 'misma', 'habla', 'digame', 'dime', 'por', 'supuesto', 'un', 'gusto', 'mucho', 'buenas', 'tardes', 'dias', 'noches', 'aja', 'mande', 'adelante', 'listo', 'ya', 'presente', 'mjm', 'mhm', 'ajam', 'sip', 'simon', 'ok', 'okey', 'oye'])
  const YES_ANCHORS = new Set(['si', 'soy', 'yo', 'correcto', 'exacto', 'efectivamente', 'claro', 'asi', 'aqui', 'listo', 'presente', 'sip', 'mande', 'digame', 'dime'])
  const IDENTITY_NEXT_STEP = 'Perfecto, gracias. Me comunico para confirmar que cuente con las facturas correspondientes al mes y conocer la fecha estimada de pago. ¿Ya recibió sus facturas?'

  function isClearYes(text: string): boolean {
    if (text.includes('?') || text.includes('¿')) return false
    const words = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    if (words.length === 0 || words.length > 6) return false
    return words.every((w) => YES_WORDS.has(w)) && words.some((w) => YES_ANCHORS.has(w))
  }

  function tryFastIdentityConfirmation(text: string): boolean {
    if (processingTurn || !callDocId || !clientInfo || clientInfo.rfc) return false
    if (history.length !== 1 || history[0].role !== 'assistant') return false
    if (!isClearYes(text)) return false

    turnStartedAt = Date.now()
    firstAudioLogged = false
    const ctx = tts.beginTurn()
    if (!ctx) return false
    currentContextId = ctx
    console.log('[VoiceCartesia] Camino rápido: identidad confirmada sin pasar por Claude')

    history.push({ role: 'user', content: text })
    pushUserTranscript(text)

    for (const sentence of IDENTITY_NEXT_STEP.match(/[^.?]+[.?]/g) ?? [IDENTITY_NEXT_STEP]) {
      tts.sendText(ctx, sentence, true)
    }
    tts.endTurn(ctx)
    recordAssistant(IDENTITY_NEXT_STEP)
    executeTool({ name: 'confirmar_identidad', input: {} }).catch((err) =>
      console.error('[VoiceCartesia] Error en confirmar_identidad:', err)
    )
    return true
  }

  // El guardado real a Mongo (con latencyMs/durationMs) se hace en tts.on('done'), no
  // aquí — aquí solo se actualiza `history` (Claude necesita verlo de inmediato para el
  // siguiente turno, no puede esperar a que termine de sonar el audio).
  function recordAssistant(text: string): void {
    history.push({ role: 'assistant', content: text })
    pendingAssistantText = text
    // Mismo criterio que voiceStream.controller.ts: la frase que el prompt instruye decir
    // en la rama de buzón de voz es la señal directa y confiable de que no contestó una
    // persona.
    if (text.toLowerCase().includes('le devolvemos la llamada')) markVoicemail()
  }

  function markVoicemail(): void {
    if (!callDocId) return
    Call.findByIdAndUpdate(callDocId, { detectedVoicemail: true }).catch((err) =>
      console.error('[VoiceCartesia] Error marcando detectedVoicemail:', err)
    )
  }

  // Habla un texto ya conocido de una sola vez (el saludo) — sin pasar por Claude.
  function speakFixed(text: string): void {
    const ctx = tts.beginTurn()
    if (!ctx) return
    currentContextId = ctx
    turnStartedAt = Date.now()
    firstAudioLogged = false
    tts.sendText(ctx, text, true)
    tts.endTurn(ctx)
    recordAssistant(text)
  }

  // Frase completa (o cláusula larga) lista para mandarse a voz sin esperar el resto.
  function takeSpeakableChunk(buffer: string, isFirstChunk: boolean): { chunk: string; rest: string } | null {
    // La primera frase del turno se manda en cuanto termina, sin esperar el espacio o texto
    // que la sigue — ahorra ~300-400ms del arranque. Se exceptúa cuando el signo va tras un
    // dígito ("12," puede ser "12,500").
    if (isFirstChunk) {
      const early = buffer.match(/^(.{6,}[^\d\s][,.!?…])$/s)
      if (early) return { chunk: early[1], rest: '' }
    }
    const m = buffer.match(/^(.*?[.!?…]+["')\]]?)(\s+)/s) ?? buffer.match(/^(.{35,}?[,;:—])(\s+)/s)
    if (!m) return null
    return { chunk: m[1], rest: buffer.slice(m[0].length) }
  }

  // Texto entre paréntesis o corchetes son acotaciones del modelo ("(esperando...)"), no
  // algo para decir — visto en la prueba con buzón de voz, donde se leyó en voz alta.
  function stripStageDirections(delta: string): string {
    let out = ''
    for (const ch of delta) {
      if (ch === '(' || ch === '[') {
        stageDepth++
        continue
      }
      if ((ch === ')' || ch === ']') && stageDepth > 0) {
        stageDepth--
        continue
      }
      if (stageDepth === 0) out += ch
    }
    return out
  }

  // Si ElevenLabs nunca avisa que terminó (error, socket caído), la despedida no debe
  // dejar la llamada colgada hasta el límite de tiempo de Twilio.
  function scheduleHangupFallback(): void {
    setTimeout(() => closeAll(), 30000)
  }

  // Un turno = mensaje nuevo del usuario (si hay) + Claude en streaming + tool calls. El
  // texto de Claude se manda a ElevenLabs frase por frase mientras se genera; las tools se
  // ejecutan dentro del propio ciclo de Claude (con su resultado real, ver executeTool) y
  // siempre antes de cerrar el turno de voz, así shouldHangup ya está definido cuando
  // ElevenLabs avisa que terminó de hablar.
  async function runTurn(newUserText?: string): Promise<void> {
    if (!callDocId) return
    // Si el cliente habla mientras Claude aún procesa el turno anterior, no se descarta:
    // se guarda y se procesa junto en cuanto termine.
    if (processingTurn) {
      if (newUserText) queuedUserText = queuedUserText ? `${queuedUserText} ${newUserText}` : newUserText
      return
    }
    processingTurn = true
    turnStartedAt = Date.now()
    firstAudioLogged = false
    stageDepth = 0
    let ctx = ''
    // Declarado fuera del try (no dentro) porque el drenado de queuedUserText de abajo
    // necesita saber si este turno terminó CON o SIN audio, para decidir si tiene que
    // esperar a tts.on('done') o si puede drenar de inmediato (ver comentario abajo).
    let spoken = ''
    try {
      if (newUserText) {
        history.push({ role: 'user', content: newUserText })
        pushUserTranscript(newUserText)
      }

      ctx = tts.beginTurn()
      currentContextId = ctx
      let pending = ''
      let firstTokenLogged = false

      const sendChunk = (chunk: string) => {
        spoken = spoken ? `${spoken} ${chunk.trim()}` : chunk.trim()
        console.log(`[VoiceCartesia] +${Date.now() - turnStartedAt}ms enviado a voz: "${chunk.trim()}"`)
        tts.sendText(ctx, chunk, true)
      }

      const onText = (rawDelta: string) => {
        const delta = stripStageDirections(rawDelta)
        if (!delta) return
        if (!firstTokenLogged) {
          firstTokenLogged = true
          console.log(`[VoiceCartesia] +${Date.now() - turnStartedAt}ms primer texto de Claude`)
        }
        pending += delta
        let next = takeSpeakableChunk(pending, !spoken)
        while (next) {
          pending = next.rest
          sendChunk(next.chunk)
          next = takeSpeakableChunk(pending, !spoken)
        }
      }

      const flushPending = () => {
        if (pending.trim()) sendChunk(pending)
        pending = ''
      }

      // Lo último que dijo Claude antes de una tool se manda a voz ANTES de ejecutarla, para
      // que la ejecución (base de datos) no retrase la última frase.
      const result = await generateLiveVoiceTurn(history, clientInfo, phone, onText, async (toolCall) => {
        flushPending()
        return executeTool(toolCall)
      })
      flushPending()
      // Se acumula con $inc (varios turnos por llamada) — mismo patrón que openaiUsage en
      // voiceStream.controller.ts; handleStatus suma su resumen post-llamada a este total.
      Call.findByIdAndUpdate(callDocId, {
        $inc: {
          'claudeUsage.inputTokens': result.usage.inputTokens,
          'claudeUsage.outputTokens': result.usage.outputTokens,
        },
      }).catch((err) => console.error('[VoiceCartesia] Error guardando uso de Claude:', err))
      console.log(`[VoiceCartesia] +${Date.now() - turnStartedAt}ms Claude terminó: "${spoken}" tools=${result.toolCalls.map((t) => t.name).join(',') || '-'}`)

      if (spoken) {
        tts.endTurn(ctx)
        recordAssistant(spoken)
        if (shouldHangup) scheduleHangupFallback()
      } else {
        // Sin texto no habrá evento 'done' de ElevenLabs — si había que colgar, se cuelga ya.
        tts.cancel(ctx)
        if (shouldHangup) setTimeout(() => closeAll(), 500)
      }
      consecutiveFailures = 0
    } catch (err) {
      console.error('[VoiceCartesia] Error generando turno:', err)
      if (ctx) tts.cancel(ctx)
      consecutiveFailures++
      // Antes un fallo de Claude/red dejaba la línea muda hasta que el cliente volviera a
      // hablar; ahora el agente pide repetir (máx. 2 fallos seguidos, para no ciclar).
      if (!closed && !shouldHangup && consecutiveFailures <= 2) speakFixed('Disculpe, ¿me podría repetir, por favor?')
    } finally {
      processingTurn = false
    }
    // Si el turno SÍ habló (tts.endTurn), el drenado de queuedUserText se hace en
    // tts.on('done') más arriba, una vez que el audio de ESTE turno termine de sonar —
    // hacerlo aquí de inmediato pisaría currentContextId mientras ElevenLabs todavía
    // manda audio en curso (mismo bug ya arreglado para el camino de deepgram.on
    // ('transcript'), visto de nuevo en pruebas reales por este segundo camino). Si el
    // turno NO habló (tts.cancel, sin audio que esperar), sí es seguro drenar ya mismo.
    if (!spoken && queuedUserText && !closed && !shouldHangup) {
      const next = queuedUserText
      queuedUserText = ''
      await runTurn(next)
    }
  }

  // Ejecuta una tool y regresa su resultado REAL a Claude (antes siempre era "ok", lo que
  // hacía que verificar_rfc nunca pudiera fallar). Las tools de registro son idempotentes:
  // Claude las repite seguido (en la prueba real registrar_promesa_pago corrió 2 veces y
  // dejó 2 promesas y 2 recordatorios duplicados en la base).
  async function executeTool(toolCall: LiveToolCall): Promise<ToolOutcome> {
    if (!callDocId) return { output: 'ok' }
    const call = await Call.findById(callDocId)
    if (!call) return { output: 'ok' }

    if (ONCE_ONLY_TOOLS.has(toolCall.name)) {
      if (executedOnce.has(toolCall.name)) return { output: 'Ya estaba registrado. No repitas esta función.' }
      executedOnce.add(toolCall.name)
    }
    if (toolCall.name === 'registrar_promesa_pago') {
      const key = `${toolCall.input.monto}|${toolCall.input.fecha}`
      if (registeredPromises.has(key)) return { output: 'Ya estaba registrada. No repitas esta función.' }
      registeredPromises.add(key)
    }

    // functionCallLog es el detalle con elapsedMs para mostrar en el modal EN QUÉ
    // momento del flujo se disparó cada función (ver CallTimeline.tsx) — calledFunctions
    // se mantiene igual (solo strings) porque computeVoiceDisposition en
    // voice.controller.ts depende de ese formato exacto.
    const functionElapsedMs = callStartAt !== null ? Math.max(0, Math.round(Date.now() - callStartAt)) : 0
    await Call.findByIdAndUpdate(callDocId, {
      $push: {
        calledFunctions: toolCall.name,
        functionCallLog: { name: toolCall.name, timestamp: new Date(), elapsedMs: functionElapsedMs },
      },
    })
    console.log(`[VoiceCartesia] tool llamada: ${toolCall.name}(${JSON.stringify(toolCall.input)})`)

    switch (toolCall.name) {
      case 'confirmar_identidad':
        call.identityConfirmed = true
        await call.save()
        return { output: 'ok' }

      case 'verificar_rfc': {
        // Comparación exacta en el backend, no por criterio del modelo (igual que en
        // voiceStream.controller.ts).
        const client = call.clientId ? await Client.findById(call.clientId).lean() : null
        const expected = client?.rfc ? normalizeRFC(client.rfc as string).slice(-4) : null
        const received = normalizeRFC(String(toolCall.input.ultimos4 ?? ''))
        const matches = Boolean(expected) && received === expected
        return { output: JSON.stringify({ matches }), followUp: true }
      }

      case 'marcar_ticket_aclaracion':
        await runAction('crm', 'create_clarification_ticket', {}, call)
        return { output: 'ok' }

      case 'marcar_factura_no_recibida':
        await runAction('crm', 'mark_invoice_not_received', {}, call)
        return { output: 'ok' }

      case 'marcar_pago_domiciliado':
        await runAction('crm', 'mark_domiciliado', {}, call)
        return { output: 'ok' }

      case 'marcar_pago_en_proceso': {
        const area = typeof toolCall.input.area === 'string' ? toolCall.input.area : ''
        await runAction('crm', 'mark_payment_in_process', { area }, call)
        return { output: 'ok' }
      }

      case 'marcar_negativa_pago': {
        const motivo = typeof toolCall.input.motivo === 'string' ? toolCall.input.motivo : ''
        await runAction('crm', 'mark_payment_refusal', { motivo }, call)
        return { output: 'ok' }
      }

      case 'registrar_promesa_pago': {
        const ctx = { amount: toolCall.input.monto as number, payment_date: toolCall.input.fecha as string }
        await runAction('crm', 'create_payment_commitment', ctx, call)
        await runAction('crm', 'schedule_reminder', ctx, call)
        return { output: 'ok' }
      }

      case 'marcar_saldo_pagado': {
        const result = await runAction('payments', 'verify_payment', {}, call)
        const exists = Boolean(result?.payment_exists)
        await runAction('crm', 'mark_payment_reported', { paymentExists: exists }, call)
        return { output: JSON.stringify({ payment_exists: exists }), followUp: true }
      }

      case 'requerir_humano': {
        call.requiresHuman = true
        call.status = 'requires_human'
        await call.save()
        if (call.clientId) {
          const motivo = typeof toolCall.input.motivo === 'string' ? toolCall.input.motivo : null
          await Client.findByIdAndUpdate(call.clientId, { requiresHuman: true, requiresHumanReason: motivo })
        }
        shouldHangup = true
        return { output: 'ok' }
      }

      case 'finalizar_llamada':
        call.status = 'completed'
        await call.save()
        shouldHangup = true
        return { output: 'ok' }

      case 'marcar_extension': {
        // Mismo comportamiento que voiceStream.controller.ts (producción): es un conmutador,
        // no una persona — se guarda la extensión, se cuelga sin despedida y de inmediato se
        // vuelve a marcar con la extensión ya integrada en el número (ver placeOutboundCall,
        // que arma "número,,,,ext#" a partir de Client.knownExtension). La única diferencia
        // es que el remarcado sigue por el motor ElevenLabs.
        const extension =
          typeof toolCall.input.extension === 'string' && toolCall.input.extension.trim()
            ? toolCall.input.extension.trim()
            : '1001'
        const clientBefore = call.clientId ? await Client.findById(call.clientId).lean() : null
        const alreadyHadExtension = Boolean(clientBefore?.knownExtension)

        if (call.clientId) {
          await Client.findByIdAndUpdate(call.clientId, { knownExtension: extension })
        }
        shouldHangup = true

        // Si esta llamada YA iba con una extensión pre-cargada y de todos modos volvió a
        // sonar a conmutador, no se reintenta en automático — evita un ciclo de remarcado
        // infinito si la extensión guardada ya no es la correcta (queda para revisión manual).
        if (call.clientId && !alreadyHadExtension) {
          const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
          if (publicUrl) {
            placeOutboundCall(String(call.clientId), publicUrl, 'manual', 'elevenlabs').catch((err) =>
              console.error('[VoiceCartesia] Error re-marcando con extensión:', err)
            )
          }
        }
        return { output: 'ok' }
      }

      default:
        console.log(`[VoiceCartesia] Tool "${toolCall.name}" no implementada en este piloto todavía`)
        return { output: 'Esta función no está disponible en esta llamada. Continúa la conversación sin ella.' }
    }
  }

  async function initialize(callSid: string): Promise<void> {
    const call = await Call.findOne({ callSid })
    if (!call) {
      console.error(`[VoiceCartesia] No se encontró Call para callSid=${callSid}`)
      closeAll()
      return
    }
    callDocId = call._id as mongoose.Types.ObjectId
    phone = call.phone as string

    const client = call.clientId ? await Client.findById(call.clientId).lean() : null
    // Si falla la consulta de facturas, la llamada sigue igual (el prompt cae a agingDays).
    const invoices = client ? await loadInvoiceSummary(client._id).catch(() => null) : null
    clientInfo = client
      ? {
          name: client.name as string,
          debt: (client.debt as number) ?? 0,
          agingDays: (client.agingDays as number) ?? 0,
          status: client.status as string,
          rfc: (client.rfc as string) ?? null,
          contact: (client.contact as string) ?? null,
          invoices,
        }
      : null

    console.log(`[VoiceCartesia] Call encontrada (cliente: ${clientInfo?.name ?? 'sin cliente'})`)

    // ElevenLabs y Deepgram se conectan en paralelo, y el saludo (texto fijo, no necesita
    // a Claude) se manda a voz de inmediato — el audio del cliente que llegue mientras
    // Deepgram termina de conectar se guarda en pendingAudio y se le entrega al abrir.
    tts.connect().catch((err) => console.error('[VoiceCartesia] No se pudo conectar a ElevenLabs:', err))
    warmUpClaude(clientInfo, phone)
    const deepgramReady = deepgram.connect()
    if (clientInfo) speakFixed(buildGreeting(clientInfo.name, clientInfo.contact))

    try {
      await deepgramReady
    } catch (err) {
      console.error('[VoiceCartesia] No se pudo conectar a Deepgram:', err)
      closeAll()
      return
    }

    if (closed) return
    ready = true
    for (const payload of pendingAudio.splice(0)) deepgram.appendAudio(payload)

    // Sin cliente asociado no hay saludo fijo — se deja que Claude lo genere.
    if (!clientInfo) await runTurn()
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
        console.log(`[VoiceCartesia] Stream iniciado streamSid=${streamSid} callSid=${callSid}`)
        // Ancla de todos los elapsedMs/latencyMs del flujo (ver declaración arriba).
        callStartAt = Date.now()
        lastTurnEndAt = callStartAt
        if (!callSid) {
          closeAll()
          break
        }
        initialize(callSid).catch((err) => {
          console.error('[VoiceCartesia] Error inicializando sesión:', err)
          closeAll()
        })
        break
      }

      case 'media':
        if (event.media?.payload) {
          if (ready) deepgram.appendAudio(event.media.payload)
          else pendingAudio.push(event.media.payload)
        }
        break

      case 'stop':
        console.log('[VoiceCartesia] Stream detenido')
        closeAll()
        break

      default:
        break
    }
  })

  twilioWs.on('close', () => closeAll())
  twilioWs.on('error', (err) => {
    console.error('[VoiceCartesia] Error en WebSocket de Twilio:', err)
    closeAll()
  })
}
