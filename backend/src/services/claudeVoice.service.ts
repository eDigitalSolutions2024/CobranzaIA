import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

import mongoose from 'mongoose'

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
  intent: 'greeting' | 'collecting' | 'promise_of_payment' | 'requires_human' | 'goodbye' | 'dial_extension' | 'general'
  promises?: PaymentInstallment[]
  promiseDate?: string  // first installment (for Call record)
  amount?: number       // first installment (for Call record)
  extension?: string    // DTMF digits to dial when intent is 'dial_extension'
}

function buildSystemPrompt(clientInfo: ClientInfo | null, phone: string): string {
  const fechaHoy = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const base = `Eres Guadalupe Martínez, agente del departamento de cobranza. Hablas por teléfono. Hoy: ${fechaHoy}.

CONMUTADOR: Si quien contesta es un menú automático o conmutador (voz grabada, tono de espera, "marque la extensión de..."), no es una persona — no converses con él. Simplemente emite el marcador MARCAR_EXTENSION:7475 sin texto hablado adicional, para marcar la extensión de cobranza y esperar a que conteste una persona real.

ESTILO:
- Máximo 2 oraciones por respuesta
- Antes de responder, reconoce brevemente lo que dijo el cliente con una reacción que combine con su tono — nunca uses la misma palabra de reconocimiento que usaste en tu turno anterior. Varía entre opciones como "Entiendo.", "Claro.", "Ah, ya veo.", "Mmm, entiendo.", "Qué bien.", "Ay, lo siento.", "Perfecto.", "De acuerdo.", "Comprendo." — elige la que mejor combine si el cliente suena cooperativo, molesto, apurado o dudoso
- Montos en palabras: "cuatro mil quinientos pesos", no "$4,500"
- Fechas en palabras: "el diecisiete de junio", no "17/06"
- No repitas información ya mencionada. Adáptate si el cliente cambia de tema.
- Solo texto plano, sin emojis ni negritas

MARCADORES (siempre al final, nunca dentro del texto hablado):
- Pago único confirmado → PROMESA_PAGO:FECHA=YYYY-MM-DD,MONTO=número
- Plan de pagos (varios) → una línea PROMESA_PAGO por cuota con fecha exacta, máx 12. Luego FIN_LLAMADA.
- Cliente pide hablar con persona → REQUIERE_HUMANO
- Conversación termina (con o sin acuerdo) → FIN_LLAMADA
- Contestó un conmutador/menú automático → MARCAR_EXTENSION:7475`

  if (!clientInfo) {
    return `${base}

Número ${phone} no registrado. Saluda, pide el nombre, informa que no encuentras el expediente y ofrece transferir a un asesor.`
  }

  return `${base}

CLIENTE: ${clientInfo.name} | Deuda: ${clientInfo.debt.toLocaleString('es-MX')} pesos | Estado: ${clientInfo.status}

OBJETIVO: Preséntate, menciona el saldo, acuerda fecha y monto de pago, confirma, cierra con calidez.
- Sin dinero → "¿Cuánto podría apartar esta semana?"
- Ya pagó o número equivocado → disculpa breve + FIN_LLAMADA
- Se enoja → empatiza, ofrece otro momento + FIN_LLAMADA
- Pide WhatsApp → "Le escribimos también. Hasta luego." + FIN_LLAMADA`
}

function normalizeText(text: string): string {
  // Remove invisible Unicode characters (zero-width spaces, etc.) that Claude's API may insert
  return text.replace(/[​-‍﻿­]/g, '').trim()
}

function parseAgentResponse(raw: string): AgentResponse {
  const text = normalizeText(raw)
  const base: AgentResponse = { message: text, intent: 'general' }

  const extensionMatch = text.match(/MARCAR_EXTENSION:\s*(\d+)/)
  if (extensionMatch) {
    return {
      ...base,
      intent: 'dial_extension',
      extension: extensionMatch[1],
      message: text.replace(/MARCAR_EXTENSION:\s*\d+/g, '').trim(),
    }
  }

  if (text.includes('REQUIERE_HUMANO')) {
    return {
      ...base,
      intent: 'requires_human',
      message: text.replace(/REQUIERE_HUMANO/g, '').trim(),
    }
  }

  const promiseMatches = [...text.matchAll(/PROMESA_PAGO:\s*FECHA\s*=\s*(\d{4}-\d{2}-\d{2})\s*,\s*MONTO\s*=\s*(\d+(?:\.\d+)?)/g)]
  if (promiseMatches.length > 0) {
    const promises: PaymentInstallment[] = promiseMatches.map(m => ({
      promiseDate: m[1],
      amount: parseFloat(m[2]),
    }))
    return {
      ...base,
      intent: 'promise_of_payment',
      promises,
      promiseDate: promises[0].promiseDate,
      amount: promises[0].amount,
      message: text.replace(/PROMESA_PAGO:[^\n]*/g, '').replace(/FIN_LLAMADA/g, '').trim(),
    }
  }

  if (text.includes('FIN_LLAMADA')) {
    return {
      ...base,
      intent: 'goodbye',
      message: text.replace(/FIN_LLAMADA/g, '').trim(),
    }
  }

  return base
}

export async function generateVoiceResponse(
  history: ConversationTurn[],
  clientInfo: ClientInfo | null,
  phone: string
): Promise<AgentResponse> {
  const systemPrompt = buildSystemPrompt(clientInfo, phone)

  // Anthropic requires messages to start with 'user' and alternate properly
  let messages: Array<{ role: 'user' | 'assistant'; content: string }>

  if (history.length === 0) {
    messages = [{ role: 'user', content: '[INICIO_LLAMADA]' }]
  } else if (history[0].role === 'assistant') {
    // Prepend synthetic user trigger so the array starts with 'user'
    messages = [
      { role: 'user', content: '[INICIO_LLAMADA]' },
      ...history.map((t) => ({ role: t.role, content: t.content })),
    ]
  } else {
    messages = history.map((t) => ({ role: t.role, content: t.content }))
  }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 220,
    system: systemPrompt,
    messages,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return parseAgentResponse(text)
}

// ─── Funciones de soporte para el motor de flujo (flowEngine.service.ts) ───────
// A diferencia de generateVoiceResponse (conversación libre), estas son llamadas
// a Claude acotadas: clasificación de una sola palabra o extracción de JSON corto.

export async function classifyIntent(
  utterance: string,
  intents: Record<string, string>
): Promise<string | null> {
  const labels = Object.keys(intents)

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 20,
    system: `Clasifica lo que dijo el cliente en UNA sola de estas categorías: ${labels.join(', ')}.
Responde ÚNICAMENTE con la palabra exacta de la categoría, sin explicación ni puntuación.`,
    messages: [{ role: 'user', content: utterance }],
  })

  const text = normalizeText(response.content[0].type === 'text' ? response.content[0].text : '').toLowerCase()
  return labels.find((label) => label.toLowerCase() === text) ?? null
}

export interface CommitmentExtraction {
  amount: number | null
  paymentDate: string | null // YYYY-MM-DD
}

export async function extractCommitment(utterance: string, todayIso: string): Promise<CommitmentExtraction> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: `Extrae de la frase del cliente el monto en pesos (solo número, sin signos) y la fecha de pago en formato YYYY-MM-DD (fecha absoluta, hoy es ${todayIso}).
Responde ÚNICAMENTE con JSON válido, sin markdown: {"amount": number|null, "paymentDate": "YYYY-MM-DD"|null}`,
    messages: [{ role: 'user', content: utterance }],
  })

  try {
    const raw = normalizeText(response.content[0].type === 'text' ? response.content[0].text : '{}')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
    const parsed = JSON.parse(raw)
    return {
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      paymentDate: typeof parsed.paymentDate === 'string' ? parsed.paymentDate : null,
    }
  } catch {
    console.error('[Voice] Error al parsear extractCommitment')
    return { amount: null, paymentDate: null }
  }
}

export async function verifyNameMatch(utterance: string, expectedName: string): Promise<boolean> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    system: `El cliente dijo su nombre por teléfono (la transcripción de voz puede tener errores de reconocimiento). Determina si razonablemente corresponde al nombre registrado en la cuenta: "${expectedName}". Tolera errores menores de transcripción, acentos, orden de nombre/apellido, o que diga solo parte del nombre si es inequívoco.
Responde ÚNICAMENTE con "SI" o "NO".`,
    messages: [{ role: 'user', content: utterance }],
  })

  const text = normalizeText(response.content[0].type === 'text' ? response.content[0].text : '').toUpperCase()
  return text.includes('SI')
}

export interface CallAnalysis {
  hasAgreement: boolean
  promises: PaymentInstallment[]
  summary: string
}

export async function analyzeCallTranscript(
  transcript: Array<{ role: string; content: string }>,
  clientInfo: ClientInfo | null
): Promise<CallAnalysis> {
  const relevant = transcript.filter(t => !t.content.startsWith('['))

  if (relevant.length < 2) {
    return { hasAgreement: false, promises: [], summary: 'Llamada sin conversación útil' }
  }

  const transcriptText = relevant
    .map(t => `${t.role === 'assistant' ? 'Agente' : 'Cliente'}: ${t.content}`)
    .join('\n')

  const today = new Date().toISOString().split('T')[0]
  const debtContext = clientInfo
    ? `Deuda total del cliente: ${clientInfo.debt.toLocaleString('es-MX')} pesos MXN`
    : 'Deuda del cliente: desconocida'

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: `Eres un analizador de transcripciones de llamadas de cobranza.
Fecha actual: ${today}. ${debtContext}

Lee la transcripción completa y determina cuál fue el ACUERDO FINAL.
Si hubo varias propuestas o renegociaciones, usa solo la ÚLTIMA que el cliente confirmó.

Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional:
{
  "hasAgreement": true,
  "promises": [{"promiseDate": "YYYY-MM-DD", "amount": 1234}],
  "summary": "descripción breve de lo acordado"
}

Reglas:
- hasAgreement = true solo si el cliente confirmó explícitamente una fecha y monto
- Para planes de pago recurrentes, incluye una entrada por cuota con su fecha exacta
- Si no hubo compromiso concreto, devuelve: {"hasAgreement": false, "promises": [], "summary": "Sin acuerdo"}
- Las fechas deben ser absolutas en formato YYYY-MM-DD`,
    messages: [{ role: 'user', content: transcriptText }],
  })

  try {
    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const raw = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(raw)
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

