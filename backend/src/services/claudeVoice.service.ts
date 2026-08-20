import Anthropic from '@anthropic-ai/sdk'
import type { WebSocket } from 'ws'
import mongoose from 'mongoose'
import { ConversationState, ClientEmotion, getStateGuidance } from './conversationStateMachine'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Sliding window: max turns kept verbatim before summary kicks in.
const CONTEXT_WINDOW = 6
// After this many total turns, compress earlier turns into a summary.
export const SUMMARIZE_AFTER_TURNS = 8
// When summary exists, keep only this many recent turns verbatim.
const KEEP_RECENT_WITH_SUMMARY = 4

export interface ClientInfo {
  _id: mongoose.Types.ObjectId
  name: string
  debt: number
  status: string
  phone: string
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface PaymentInstallment {
  promiseDate: string
  amount: number
}

export interface AgentResponse {
  message: string
  intent: 'greeting' | 'collecting' | 'promise_of_payment' | 'requires_human' | 'goodbye' | 'general'
  promises?: PaymentInstallment[]
  promiseDate?: string
  amount?: number
}

// Tool definitions replace text markers — structured, reliable, no regex parsing.
// Descriptions include examples so Claude knows WHEN to call them.
const COLLECTION_TOOLS: Anthropic.Tool[] = [
  {
    name: 'promise_of_payment',
    description:
      'Call this ONLY when the client explicitly confirms a specific date AND amount they will pay. ' +
      'Example triggers: "El viernes le pago 500 pesos", "Sí, el 15 deposito lo que debo". ' +
      'DO NOT call if the client is vague ("voy a ver", "tal vez"). ' +
      'Set message to your spoken confirmation of the agreement (max 2 sentences).',
    input_schema: {
      type: 'object' as const,
      properties: {
        promises: {
          type: 'array',
          description: 'One entry per payment. Most calls have exactly one.',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'ISO date YYYY-MM-DD — convert spoken dates like "el viernes" to absolute date' },
              amount: { type: 'number', description: 'Amount in MXN pesos — if client says "lo que debo", use the full debt amount' },
            },
            required: ['date', 'amount'],
          },
          minItems: 1,
          maxItems: 12,
        },
        message: {
          type: 'string',
          description: 'Your confirmation out loud. Example: "Perfecto, entonces el viernes deposita quinientos pesos, ¿correcto?"',
        },
      },
      required: ['promises', 'message'],
    },
  },
  {
    name: 'end_call',
    description:
      'Call this to end the conversation. Use after: a farewell exchange, a transfer to human, ' +
      'wrong number confirmation, or when client is too angry to continue. ' +
      'Set message to your final spoken goodbye (1 sentence, warm and brief).',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          enum: ['requires_human', 'agreement_reached', 'no_agreement', 'wrong_number', 'already_paid', 'client_angry'],
          description: 'Pick the reason that best describes why the call is ending.',
        },
        message: {
          type: 'string',
          description: 'Final goodbye. Example: "Muchas gracias, que tenga buen día." or "En un momento le comunico con un asesor."',
        },
      },
      required: ['reason', 'message'],
    },
  },
]

function buildSystemPrompt(
  clientInfo: ClientInfo | null,
  phone: string,
  state: ConversationState = 'greeting',
  emotion: ClientEmotion = 'neutral'
): string {
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // State-specific guidance replaces the monolithic instruction block.
  // Each state carries only what Claude needs right now — nothing extraneous.
  const stateGuidance = getStateGuidance(state, emotion)

  const base = `Eres Guadalupe, cobradora. Hoy: ${today}.
Por teléfono. Máximo 2 oraciones. Natural y humana.
Confirma con "Entiendo.", "Claro.", "De acuerdo." antes de responder.
Montos en palabras (cuatro mil quinientos pesos). Fechas en palabras (el diecisiete de junio).
Sin emojis. Sin repetir lo ya dicho.
${stateGuidance}`

  if (!clientInfo) {
    return `${base}
Número ${phone} no registrado. Saluda, pide nombre, transfiere con asesor (end_call, reason=requires_human).`
  }

  const debtFormatted = clientInfo.debt.toLocaleString('es-MX')
  return `${base}
CLIENTE: ${clientInfo.name} | Deuda: ${debtFormatted} pesos | Estado: ${clientInfo.status}`
}

// Generates a brief summary (≤80 tokens) of turns that would otherwise be dropped.
// Called once per session at SUMMARIZE_AFTER_TURNS. Export so voice.controller can trigger it.
export async function summarizeDroppedTurns(turns: ConversationTurn[]): Promise<string> {
  if (turns.length === 0) return ''
  const text = turns
    .map((t) => `${t.role === 'assistant' ? 'Agente' : 'Cliente'}: ${t.content}`)
    .join('\n')

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `Resume en máximo 2 oraciones lo acordado en esta llamada de cobranza:\n${text}`,
    }],
  })
  return res.content[0].type === 'text' ? res.content[0].text.trim() : ''
}

// Builds the message array for Claude.
// With summary: injects compressed context + last KEEP_RECENT_WITH_SUMMARY turns.
// Without summary: sliding window (first 2 + last 4) as before.
function buildMessages(
  history: ConversationTurn[],
  summary: string | null = null
): Array<{ role: 'user' | 'assistant'; content: string }> {
  let turns: ConversationTurn[]

  if (summary) {
    // Summary mode: compressed prefix + last 4 turns verbatim
    turns = history.length > KEEP_RECENT_WITH_SUMMARY
      ? history.slice(-KEEP_RECENT_WITH_SUMMARY)
      : history
  } else if (history.length > CONTEXT_WINDOW) {
    // Sliding window fallback (no summary yet)
    turns = [
      ...history.slice(0, 2),
      ...history.slice(-(CONTEXT_WINDOW - 2)),
    ]
  } else {
    turns = history
  }

  const base: Array<{ role: 'user' | 'assistant'; content: string }> = []

  if (summary) {
    // Synthetic context pair — Claude treats this as established fact
    base.push({ role: 'user', content: `[Contexto previo de la llamada: ${summary}]` })
    base.push({ role: 'assistant', content: 'Entendido.' })
  }

  base.push(...turns.map((t) => ({ role: t.role, content: t.content })))

  if (base.length === 0) return [{ role: 'user', content: '[INICIO_LLAMADA]' }]
  if (base[0].role === 'assistant') {
    return [{ role: 'user', content: '[INICIO_LLAMADA]' }, ...base]
  }
  return base
}

function parseToolResponse(response: Anthropic.Message): AgentResponse {
  // Check for tool use blocks first
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      if (block.name === 'promise_of_payment') {
        const input = block.input as { promises: Array<{ date: string; amount: number }>; message: string }
        const promises: PaymentInstallment[] = input.promises.map((p) => ({
          promiseDate: p.date,
          amount: p.amount,
        }))
        return {
          message: input.message,
          intent: 'promise_of_payment',
          promises,
          promiseDate: promises[0]?.promiseDate,
          amount: promises[0]?.amount,
        }
      }

      if (block.name === 'end_call') {
        const input = block.input as { reason: string; message: string }
        const intent = input.reason === 'requires_human' ? 'requires_human' : 'goodbye'
        return { message: input.message, intent }
      }
    }
  }

  // Fallback: text response
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.TextBlock).text)
    .join('')
    .replace(/[​-‍﻿­]/g, '')
    .trim()

  return { message: text, intent: 'general' }
}

export async function generateVoiceResponse(
  history: ConversationTurn[],
  clientInfo: ClientInfo | null,
  phone: string,
  summary: string | null = null,
  state: ConversationState = 'greeting',
  emotion: ClientEmotion = 'neutral'
): Promise<AgentResponse> {
  const systemPrompt = buildSystemPrompt(clientInfo, phone, state, emotion)
  const messages = buildMessages(history, summary)

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: systemPrompt,
    tools: COLLECTION_TOOLS,
    // Guides Claude to use tools when appropriate but still speak naturally
    tool_choice: { type: 'auto' },
    messages,
  })

  return parseToolResponse(response)
}

export interface CallAnalysis {
  hasAgreement: boolean
  promises: PaymentInstallment[]
  summary: string
}

// Fire-and-forget analysis: does NOT block handleStatus response to Twilio.
// Caller should use: analyzeCallTranscript(...).then(...).catch(...)
export async function analyzeCallTranscript(
  transcript: Array<{ role: string; content: string }>,
  clientInfo: ClientInfo | null
): Promise<CallAnalysis> {
  const relevant = transcript.filter((t) => !t.content.startsWith('['))

  if (relevant.length < 2) {
    return { hasAgreement: false, promises: [], summary: 'Llamada sin conversación útil' }
  }

  const transcriptText = relevant
    .map((t) => `${t.role === 'assistant' ? 'Agente' : 'Cliente'}: ${t.content}`)
    .join('\n')

  const today = new Date().toISOString().split('T')[0]
  const debtContext = clientInfo
    ? `Deuda: ${clientInfo.debt.toLocaleString('es-MX')} pesos`
    : 'Deuda desconocida'

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: `Analiza transcripción de cobranza. Fecha: ${today}. ${debtContext}.
Responde SOLO con JSON válido sin markdown:
{"hasAgreement":bool,"promises":[{"promiseDate":"YYYY-MM-DD","amount":number}],"summary":"string"}
Reglas: hasAgreement=true solo si cliente confirmó fecha+monto explícitos. Usa solo el ÚLTIMO acuerdo si hubo renegociación.`,
    messages: [{ role: 'user', content: transcriptText }],
  })

  try {
    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      hasAgreement: Boolean(parsed.hasAgreement),
      promises: Array.isArray(parsed.promises) ? parsed.promises : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    }
  } catch {
    console.error('[Voice] Error al parsear análisis post-llamada')
    return { hasAgreement: false, promises: [], summary: 'Error al analizar transcript' }
  }
}

// WebSocket handler for Twilio Media Streams (real-time audio pipeline).
// Requires an STT service (Deepgram recommended) wired to this handler.
// To enable: point <Stream url="wss://YOUR_DOMAIN/api/voice/stream"/> in TwiML.
export function handleMediaStream(ws: WebSocket): void {
  let streamSid: string | null = null

  ws.on('message', (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        event: string
        start?: { streamSid: string }
        media?: { payload: string }
      }

      switch (msg.event) {
        case 'connected':
          console.log('[MediaStream] Twilio conectado')
          break
        case 'start':
          streamSid = msg.start?.streamSid ?? null
          console.log(`[MediaStream] Stream iniciado: ${streamSid}`)
          break
        case 'media':
          // Pipe msg.media.payload (base64 mulaw 8kHz) to Deepgram via WebSocket.
          // On transcript → call generateVoiceResponse() → TTS → send audio back.
          // See: https://developers.deepgram.com/docs/twilio-integration
          break
        case 'stop':
          console.log(`[MediaStream] Stream detenido: ${streamSid}`)
          ws.close()
          break
      }
    } catch (err) {
      console.error('[MediaStream] Error parsing message:', err)
    }
  })

  ws.on('error', (err) => console.error('[MediaStream] WebSocket error:', err))
  ws.on('close', () => console.log('[MediaStream] WebSocket cerrado'))
}
