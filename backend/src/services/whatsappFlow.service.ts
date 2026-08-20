// WhatsApp "llamada preventiva" script — cliente al corriente / 0 días.
// Sigue exactamente la secuencia del guion: identidad → factura recibida →
// fecha de pago (10 ramas posibles) → confirmación → cierre.
// Steps 1 y 2 son deterministas (sí/no); el paso 3 (las 10 ramas) y el paso
// de confirmación usan Claude con tool-calling, igual que el flujo de voz.

import Anthropic from '@anthropic-ai/sdk'
import mongoose from 'mongoose'
import { extractDaysOffset, addDays } from '../utils/dateParsing'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const COMPANY_NAME = 'HP Financial Services'

export interface FlowClient {
  _id: mongoose.Types.ObjectId
  name: string
  debt: number
  phone: string
}

export type FlowState = 'identity' | 'invoice_check' | 'payment_date' | 'confirming' | 'closed'

export interface FlowContext {
  pendingOutcomeType?: string
  clarificationAttempts?: number
  pendingAmount?: number
  pendingDate?: string // ISO
  [key: string]: unknown
}

export interface FlowOutcome {
  type: string
  amount?: number
  date?: Date
  notes?: string
}

export interface FlowResult {
  reply: string
  newState: FlowState
  newContext: FlowContext
  closeConversation: boolean
  outcome?: FlowOutcome
  createPromise?: { amount: number; date: Date }
}

function money(n: number): string {
  return `$${Number(n).toLocaleString('es-MX')}`
}

// ── Step 1: identity — deterministic, no LLM ────────────────────────────────

const WRONG_NUMBER_PATTERNS: RegExp[] = [
  /n[uú]mero equivocado/i, /se equivoc[oó]/i, /no soy (yo|esa persona)/i,
  /n[uú]mero incorrecto/i, /no lo conozco/i, /no tengo ninguna deuda/i, /no le debo nada/i,
  /no existe (esa|ninguna) cuenta/i,
]

function isWrongNumber(text: string): boolean {
  return WRONG_NUMBER_PATTERNS.some((p) => p.test(text))
}

// ── Step 2: invoice_check — deterministic, no LLM ───────────────────────────

const NEGATIVE_PATTERNS: RegExp[] = [
  /^no\b/i, /a[uú]n no/i, /todav[íi]a no/i, /no la (he )?recib/i,
  /no me ha(n)? llegado/i, /no las tengo/i, /no he recibido/i, /no me lleg[oó]/i,
]

function isNegative(text: string): boolean {
  return NEGATIVE_PATTERNS.some((p) => p.test(text.trim()))
}

// ── Step 3: payment_date — Claude + tools ───────────────────────────────────

const OUTCOME_TYPES = [
  'reported_payment', 'domiciliado', 'callback_later', 'no_payment_capacity',
  'dispute', 'wrong_contact', 'resend_invoice', 'pending_human',
] as const

const NEEDS_FOLLOWUP: Record<string, boolean> = {
  reported_payment: true,
  domiciliado: true,
  callback_later: true,
  no_payment_capacity: true,
  dispute: true,
  wrong_contact: true,
  resend_invoice: true,
  pending_human: false,
}

const CLOSING_LINE: Record<string, string> = {
  reported_payment: 'Gracias, quedó registrado su pago para verificación. Cualquier ajuste se lo haremos saber.',
  domiciliado: 'Perfecto, quedó registrado el cargo domiciliado. Gracias por su tiempo.',
  callback_later: 'Quedó agendado. Le contactaremos en la fecha indicada. Gracias por su tiempo.',
  no_payment_capacity: 'Entendido, quedó registrado. Un asesor podrá contactarle para revisar opciones. Gracias.',
  dispute: 'Quedó registrada su aclaración. Un asesor revisará el monto y le contactará. Gracias por su tiempo.',
  wrong_contact: 'Gracias, actualizaremos el contacto para futuras comunicaciones.',
  resend_invoice: 'Con gusto, en breve le reenviamos la factura por este medio. Gracias.',
}

const PAYMENT_DATE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'register_payment_promise',
    description:
      'Call ONLY when the client gives a SPECIFIC date AND amount they will pay, stated affirmatively ' +
      '(e.g. "el 15 de agosto por $4,500", "le pago el viernes lo que debo"). ' +
      'Convert relative dates to an absolute ISO date (today\'s context is provided). ' +
      'If the client says "lo que debo" use the full debt amount provided.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        amount: { type: 'number', description: 'Amount in MXN pesos' },
        message: {
          type: 'string',
          description:
            'Your reply: restate the intention and ask for explicit confirmation. Example: ' +
            '"Perfecto, entonces registro una intención de pago por $4,500 pesos para el 15 de agosto. ¿Es correcta la información?"',
        },
      },
      required: ['date', 'amount', 'message'],
    },
  },
  {
    name: 'register_outcome',
    description:
      'Call for client responses that are NOT a clean payment promise. Pick the type that matches, and ' +
      'phrase `message` as the exact follow-up question for that branch (see system prompt for the script per type).',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: [...OUTCOME_TYPES] },
        message: { type: 'string', description: 'Your reply — the follow-up question or closing line for this branch.' },
      },
      required: ['type', 'message'],
    },
  },
  {
    name: 'request_clarification',
    description:
      'Call when the client response is ambiguous ("no sé", "creo que sí", "tal vez") or incomprehensible. ' +
      'NEVER guess or register a commitment on an ambiguous answer — ask a clarifying question instead.',
    input_schema: {
      type: 'object' as const,
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
]

function buildPaymentDateSystemPrompt(client: FlowClient): string {
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return `Eres Guadalupe, asistente virtual de ${COMPANY_NAME}, escribiendo por WhatsApp a ${client.name}. Hoy: ${today}.
Saldo del cliente: ${money(client.debt)} pesos.
Acabas de preguntarle: "¿Tiene contemplada alguna fecha para realizar el pago?". Clasifica su respuesta usando EXACTAMENTE una herramienta:

- FECHA y MONTO concretos y afirmativos ("el 15 de agosto por $4,500", "le pago el viernes lo que debo") → register_payment_promise.

- "Ya pagué" / "ya pagamos" → register_outcome tipo reported_payment. Tu mensaje DEBE preguntar la fecha aproximada del pago: "Gracias, ¿me podría indicar la fecha aproximada en que se realizó el pago?". NUNCA lo registres como promesa de pago.

- "Está domiciliado" / cargo automático → register_outcome tipo domiciliado. Tu mensaje DEBE preguntar: "Entendido, ¿el cargo tiene programada alguna fecha específica?". NUNCA lo registres como promesa normal.

- Respuesta AMBIGUA ("no sé", "creo que sí", "tal vez", "no" sin más contexto) → request_clarification. Pregunta: "¿Se refiere a que ya tiene una fecha contemplada, o prefiere que le contactemos después para definirla?". NUNCA asumas ni registres un compromiso ante una respuesta ambigua.

- Pide tiempo para revisarlo ("déjame revisarlo", "lo voy a checar", "le hablo después") → register_outcome tipo callback_later. Pregunta: "¿Qué fecha y horario le convendría para volver a contactarle?".

- No puede pagar ahorita ("no tengo fecha", "no puedo pagar en este momento") → register_outcome tipo no_payment_capacity. Pregunta: "¿Tiene una fecha aproximada en la que considere posible realizarlo?".

- El monto es incorrecto ("el monto no es correcto", "la factura está mal") → register_outcome tipo dispute. Di: "Registraré su aclaración para revisión. ¿Me podría indicar cuál considera que es el monto correcto o la diferencia?".

- La cuenta la ve otra persona ("eso lo ve mi contador", "no me corresponde a mí") → register_outcome tipo wrong_contact. Pregunta: "¿Me podría indicar quién es la persona responsable de este pago para poder contactarla?".

- Pide que le manden la factura ("mándame la factura", "no la tengo") → register_outcome tipo resend_invoice. Di: "Con gusto, ¿confirmamos que se la reenviamos por este mismo medio?".

- Pide hablar con una persona/asesor, o su respuesta sigue siendo incomprensible tras una aclaración → register_outcome tipo pending_human. Di: "Claro, un asesor se pondrá en contacto con usted en breve para apoyarle."

Máximo 2 oraciones por mensaje. Sin emojis. Tono cálido y profesional, en español de México.`
}

const CONFIRMING_TOOLS: Anthropic.Tool[] = [
  {
    name: 'confirm_agreement',
    description: 'Call once the client confirms or corrects the payment intention you just repeated back to them.',
    input_schema: {
      type: 'object' as const,
      properties: {
        correct: { type: 'boolean', description: 'true if the client confirmed the amount and date are correct' },
        date: { type: 'string', description: 'Corrected ISO date (YYYY-MM-DD) — only if correct=false and the client gave a new one. Structured field only — never write the ISO format inside `message`.' },
        amount: { type: 'number', description: 'Corrected amount in MXN — only if correct=false and the client gave a new one' },
        message: {
          type: 'string',
          description:
            'Your reply, in natural spoken Spanish. Closing line if correct=true. If correct=false, restate the ' +
            'new amount/date IN WORDS (e.g. "el 20 de agosto", never "2026-08-20") and ask to confirm again.',
        },
      },
      required: ['correct', 'message'],
    },
  },
]

function buildConfirmingSystemPrompt(context: FlowContext): string {
  const amount = context.pendingAmount ?? 0
  const date = context.pendingDate ?? ''
  return `Eres Guadalupe, asistente virtual de ${COMPANY_NAME}, escribiendo por WhatsApp.
Ya le dijiste al cliente: "Perfecto, entonces registro una intención de pago por ${money(amount)} pesos para el ${date}. ¿Es correcta la información?" y esperas su respuesta.

- Si confirma ("sí", "es correcto", "así es") → confirm_agreement con correct=true. Tu mensaje de cierre debe ser: "Queda registrada. Muchas gracias por su tiempo. Que tenga excelente día."
- Si corrige el monto o la fecha → confirm_agreement con correct=false y los valores corregidos que haya dado (deja el otro campo vacío si no lo corrigió). Tu mensaje debe repetir la nueva intención y volver a pedir confirmación.
- Si dice que no sin dar una corrección clara → confirm_agreement con correct=false, sin nuevos valores. Pregunta amablemente cuál es el monto o la fecha correctos.

Máximo 2 oraciones. Sin emojis. Tono cálido y profesional, en español de México.`
}

// ── Main entry point ─────────────────────────────────────────────────────

function firstToolUse(response: Anthropic.Message): Anthropic.ToolUseBlock | undefined {
  return response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
}

function fallbackText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

export async function advanceWhatsappFlow(
  text: string,
  client: FlowClient,
  state: FlowState | null,
  context: FlowContext
): Promise<FlowResult> {
  const effectiveState: FlowState = state ?? 'identity'

  // --- STEP 1: identity ---
  if (effectiveState === 'identity') {
    if (isWrongNumber(text)) {
      return {
        reply: 'Con mucho gusto, disculpe la molestia. Actualizaremos nuestros registros. Que tenga buen día.',
        newState: 'closed',
        newContext: {},
        closeConversation: true,
        outcome: { type: 'wrong_contact', notes: 'Número equivocado detectado al confirmar identidad' },
      }
    }
    return {
      reply: 'Gracias. Le escribo para confirmar que cuente con sus facturas del mes y conocer la fecha estimada de pago. ¿Ya recibió sus facturas?',
      newState: 'invoice_check',
      newContext: context,
      closeConversation: false,
    }
  }

  // --- STEP 2: invoice_check ---
  if (effectiveState === 'invoice_check') {
    const askPaymentDate = `El saldo correspondiente es de ${money(client.debt)}. ¿Tiene contemplada alguna fecha para realizar el pago?`
    if (isNegative(text)) {
      return {
        reply: `Las facturas corresponden al saldo actual de su cuenta. ${askPaymentDate}`,
        newState: 'payment_date',
        newContext: context,
        closeConversation: false,
      }
    }
    return { reply: askPaymentDate, newState: 'payment_date', newContext: context, closeConversation: false }
  }

  // --- STEP 3 continuation: capturing the detail for a pending outcome ---
  if (effectiveState === 'payment_date' && context.pendingOutcomeType) {
    const type = context.pendingOutcomeType
    const daysOffset = extractDaysOffset(text)
    const date = daysOffset !== null ? addDays(new Date(), daysOffset) : undefined
    return {
      reply: CLOSING_LINE[type] ?? 'Gracias, quedó registrado. Un asesor dará seguimiento.',
      newState: 'closed',
      newContext: {},
      closeConversation: true,
      outcome: { type, date, notes: text.substring(0, 300) },
    }
  }

  // --- STEP 3: payment_date branching ---
  if (effectiveState === 'payment_date') {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: buildPaymentDateSystemPrompt(client),
      tools: PAYMENT_DATE_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: text }],
    })

    const toolUse = firstToolUse(response)

    if (!toolUse) {
      return {
        reply: fallbackText(response) || '¿Podría confirmarme si ya tiene una fecha contemplada para el pago?',
        newState: 'payment_date',
        newContext: context,
        closeConversation: false,
      }
    }

    if (toolUse.name === 'register_payment_promise') {
      const input = toolUse.input as { date: string; amount: number; message: string }
      return {
        reply: input.message,
        newState: 'confirming',
        newContext: { pendingAmount: input.amount, pendingDate: input.date },
        closeConversation: false,
      }
    }

    if (toolUse.name === 'request_clarification') {
      const input = toolUse.input as { message: string }
      const attempts = (context.clarificationAttempts ?? 0) + 1
      if (attempts >= 2) {
        return {
          reply: 'Entiendo. Para atenderle mejor, un asesor se pondrá en contacto con usted en breve.',
          newState: 'closed',
          newContext: {},
          closeConversation: true,
          outcome: { type: 'pending_human', notes: 'Respuestas ambiguas repetidas — escalado automáticamente' },
        }
      }
      return {
        reply: input.message,
        newState: 'payment_date',
        newContext: { ...context, clarificationAttempts: attempts },
        closeConversation: false,
      }
    }

    if (toolUse.name === 'register_outcome') {
      const input = toolUse.input as { type: string; message: string }

      if (!NEEDS_FOLLOWUP[input.type]) {
        return {
          reply: input.message,
          newState: 'closed',
          newContext: {},
          closeConversation: true,
          outcome: { type: input.type },
        }
      }

      return {
        reply: input.message,
        newState: 'payment_date',
        newContext: { ...context, pendingOutcomeType: input.type },
        closeConversation: false,
      }
    }
  }

  // --- STEP 4: confirming ---
  if (effectiveState === 'confirming') {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: buildConfirmingSystemPrompt(context),
      tools: CONFIRMING_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: text }],
    })

    const toolUse = firstToolUse(response)

    if (!toolUse || toolUse.name !== 'confirm_agreement') {
      const amount = context.pendingAmount ?? 0
      return {
        reply: fallbackText(response) || `Para confirmar: ¿registro el pago de ${money(amount)} para el ${context.pendingDate}?`,
        newState: 'confirming',
        newContext: context,
        closeConversation: false,
      }
    }

    const input = toolUse.input as { correct: boolean; date?: string; amount?: number; message: string }

    if (input.correct) {
      const amount = context.pendingAmount ?? 0
      const date = context.pendingDate ? new Date(context.pendingDate) : new Date()
      return {
        reply: input.message,
        newState: 'closed',
        newContext: {},
        closeConversation: true,
        outcome: { type: 'payment_promise', amount, date },
        createPromise: { amount, date },
      }
    }

    return {
      reply: input.message,
      newState: 'confirming',
      newContext: {
        ...context,
        pendingAmount: input.amount ?? context.pendingAmount,
        pendingDate: input.date ?? context.pendingDate,
      },
      closeConversation: false,
    }
  }

  // --- closed / unexpected state: no-op ---
  return { reply: '', newState: 'closed', newContext: context, closeConversation: true }
}
