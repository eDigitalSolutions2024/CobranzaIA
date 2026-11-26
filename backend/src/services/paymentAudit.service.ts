// Revisión de llamadas ya guardadas en busca de pagos mal clasificados (el cliente prometió pagar, dijo que el pago
// está en proceso o que ya pagó, pero la llamada quedó con otra disposición). La persona elige qué disposiciones y
// fechas revisar desde Calls; cada hallazgo se confirma o descarta a mano, nunca se corrige solo.
//
// Dos pasos para no gastar de más: primero un filtro gratuito (mentionsPayment) y solo las que pasan se analizan con
// Claude. Cada llamada se analiza una sola vez (Call.paymentAudit).
import Anthropic from '@anthropic-ai/sdk'
import { isAutomatedPrompt } from '../utils/ivrMenu'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type AuditPaymentType = 'Payment scheduled' | 'Payment in process' | 'Payment received'

export interface AuditFinding {
  type: AuditPaymentType
  date: string | null // AAAA-MM-DD
  amount: number | null
  quote: string // frase textual del cliente
  explanation: string
}

type Turn = { role: string; content: string }

const PAYMENT_WORDS =
  /pag(o|a|ar|ado|ada|amos|an|u[eé])|dep[oó]sit|transfer|liquid|factura|saldo|pesos|domicili|programad|tesorer|cheque|fecha|quincena|fin de mes/i

const MAX_DAYS_AHEAD = 120

// Vale la pena analizarla: habló una persona (no solo grabaciones o menús) y en algún momento se trató de pago
export function mentionsPayment(transcript: Turn[]): boolean {
  const turns = (transcript ?? []).filter((t) => !t.content.startsWith('['))
  const spoke = turns.some((t) => t.role !== 'assistant' && !isAutomatedPrompt(t.content))
  return spoke && turns.some((t) => PAYMENT_WORDS.test(t.content))
}

// Para comparar la frase citada con lo que de verdad dijo el cliente: sin acentos, puntuación ni mayúsculas
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Revisa la respuesta del modelo contra la transcripción. null = no hay hallazgo confiable.
export function validateFinding(raw: any, transcript: Turn[], callDate: Date): AuditFinding | null {
  const types: Record<string, AuditPaymentType> = { promise: 'Payment scheduled', in_process: 'Payment in process', paid: 'Payment received' }
  const type = types[String(raw?.type)]
  if (!type) return null

  // La frase debe existir en lo que dijo el cliente: descarta respuestas inventadas
  const quote = typeof raw.quote === 'string' ? raw.quote.trim() : ''
  const said = normalize((transcript ?? []).filter((t) => t.role !== 'assistant').map((t) => t.content).join(' '))
  if (!quote || !normalize(quote) || !said.includes(normalize(quote))) return null

  const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null
  if (type === 'Payment scheduled') {
    // Una promesa necesita fecha, entre el día de la llamada y MAX_DAYS_AHEAD después
    const t = date ? new Date(`${date}T12:00:00-06:00`).getTime() : NaN
    const day = 24 * 3600_000
    if (!Number.isFinite(t) || t < callDate.getTime() - day || t > callDate.getTime() + MAX_DAYS_AHEAD * day) return null
  }
  const amount = typeof raw.amount === 'number' && raw.amount > 0 ? raw.amount : null
  return { type, date, amount, quote, explanation: typeof raw.explanation === 'string' ? raw.explanation : '' }
}

export async function analyzePaymentCommitment(
  transcript: Turn[],
  callDate: Date,
  debt: number | null
): Promise<{ finding: AuditFinding | null; usage: { inputTokens: number; outputTokens: number } }> {
  const text = transcript
    .filter((t) => !t.content.startsWith('['))
    .map((t) => `${t.role === 'assistant' ? 'Agente' : 'Cliente'}: ${t.content}`)
    .join('\n')
  // La referencia para "el viernes" o "fin de mes" es el día de la LLAMADA, no hoy
  const reference = callDate.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `Eres un auditor de llamadas de cobranza. La llamada fue el ${reference}.${debt ? ` Deuda del cliente: ${debt.toLocaleString('es-MX')} pesos MXN.` : ''}
Decide si el CLIENTE (no el agente) dijo algo de pago. Responde ÚNICAMENTE con JSON válido, sin markdown:
{"type":"promise|in_process|paid|none","date":"AAAA-MM-DD o null","amount":1234 o null,"quote":"frase copiada TEXTUALMENTE de una línea del Cliente","explanation":"una frase"}

- promise: el cliente dio una fecha en la que va a pagar (día exacto o uno que se deduzca con certeza, como "el viernes" o "el 30"), aunque la llamada se haya cortado antes de confirmarla. "date" es obligatoria.
- in_process: dice que el pago está en trámite o programado dentro de su empresa, sin que sea una promesa con fecha propia.
- paid: dice que ya pagó (o que el cargo domiciliado ya se hizo).
- none: cualquier otro caso. Pedir que le llamen otro día u otra hora NO es una promesa de pago. Una fecha vaga ("pronto", "la próxima semana") NO es promesa. Grabaciones, menús y frases del agente nunca cuentan. Si hay duda, none.
"quote" debe copiarse letra por letra de lo que dijo el Cliente.`,
    messages: [{ role: 'user', content: text }],
  })

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  const rawText = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
  let parsed: unknown = null
  try {
    parsed = JSON.parse(rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  } catch {
    // La respuesta no se pudo leer: se reporta como error para poder analizarla otra vez
    throw new Error('Respuesta de análisis ilegible')
  }
  return { finding: validateFinding(parsed, transcript, callDate), usage }
}
