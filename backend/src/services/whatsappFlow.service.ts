// WhatsApp "llamada preventiva" script — cliente al corriente / 0 días.
// Sigue exactamente la secuencia del guion: identidad → factura recibida →
// fecha de pago (branching por objeción) → confirmación → confirmación final
// → cierre. Los pasos 1-2 son deterministas donde la respuesta es clara; el
// resto usa Claude con tool-calling, igual que el flujo de voz.

import Anthropic from '@anthropic-ai/sdk'
import mongoose from 'mongoose'
import { extractDaysOffset, addDays } from '../utils/dateParsing'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const AGENT_NAME = 'Guadalupe'
const COMPANY_NAME = 'HP Financial Services'

export interface FlowClient {
  _id: mongoose.Types.ObjectId
  name: string
  debt: number
  phone: string
}

export type FlowState =
  | 'identity'
  | 'invoice_check'
  | 'payment_date'
  | 'confirming'
  | 'final_confirming'
  | 'closed'

export interface FlowContext {
  pendingOutcomeType?: string
  clarificationAttempts?: number
  pendingAmount?: number
  pendingDate?: string // ISO
  // true solo en el primer turno tras reabrir una conversación cerrada —
  // dispara la clasificación de reentrada en vez del no-op normal de 'closed'.
  checkingReentry?: boolean
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

// Formatea una fecha ISO (YYYY-MM-DD) en palabras para texto de cara al cliente —
// nunca mostrar el ISO crudo en un mensaje.
function formatDateWords(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
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

// ── Outcomes shared by invoice_check and payment_date ───────────────────────

const OUTCOME_TYPES = [
  'reported_payment', 'domiciliado', 'callback_later', 'no_payment_capacity',
  'dispute_amount', 'dispute_invoice', 'wrong_contact', 'resend_invoice', 'pending_human',
] as const

// Todos requieren un segundo turno para capturar el detalle (fecha, nombre de
// contacto, diferencia de monto, etc.) excepto pending_human, que es
// escalamiento inmediato sin nada más que registrar.
const NEEDS_FOLLOWUP: Record<string, boolean> = {
  reported_payment: true,
  domiciliado: true,
  callback_later: true,
  no_payment_capacity: true,
  dispute_amount: true,
  dispute_invoice: true,
  wrong_contact: true,
  resend_invoice: true,
  pending_human: false,
}

const CLOSING_LINE: Record<string, string> = {
  reported_payment: 'Gracias, quedó registrado su pago para verificación. Cualquier ajuste se lo haremos saber.',
  domiciliado: 'Perfecto, quedó registrado el cargo domiciliado. Gracias por su tiempo.',
  callback_later: 'Quedó agendado. Le contactaremos en la fecha indicada. Gracias por su tiempo.',
  no_payment_capacity: 'Entendido, quedó registrado para seguimiento, sin considerarse un compromiso de pago. Gracias.',
  dispute_amount: 'Quedó registrada su aclaración. Un asesor revisará el monto y le contactará. Gracias por su tiempo.',
  dispute_invoice: 'Gracias, un asesor revisará la factura y se pondrá en contacto con usted en breve.',
  wrong_contact: 'Gracias, actualizaremos el contacto para futuras comunicaciones.',
  resend_invoice: 'Con gusto, en breve le reenviamos la factura por este medio. Gracias.',
}

const SHARED_OUTCOME_TOOL: Anthropic.Tool = {
  name: 'register_outcome',
  description:
    'Call for client responses that are NOT a clean payment promise and not plain confirmation that the ' +
    'invoice was received. Pick the type that matches, and phrase `message` as the exact follow-up question ' +
    'for that branch (see system prompt for the script per type).',
  input_schema: {
    type: 'object' as const,
    properties: {
      type: { type: 'string', enum: [...OUTCOME_TYPES] },
      message: { type: 'string', description: 'Your reply — the follow-up question or closing line for this branch.' },
    },
    required: ['type', 'message'],
  },
}

const SHARED_CLARIFICATION_TOOL: Anthropic.Tool = {
  name: 'request_clarification',
  description:
    'Call when the client response is ambiguous ("creo que sí", "tal vez") or incomprehensible. ' +
    'NEVER guess or register a commitment on an ambiguous answer — ask a clarifying question instead.',
  input_schema: {
    type: 'object' as const,
    properties: { message: { type: 'string' } },
    required: ['message'],
  },
}

// ── Step 2: invoice_check — Claude + tools ──────────────────────────────────

const INVOICE_CHECK_TOOLS: Anthropic.Tool[] = [
  {
    name: 'mark_invoice_received',
    description: 'Call when the client confirms they already received their invoice(s) for the month.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'proceed_to_payment_date',
    description:
      'Call when the client does not know / is unsure whether they received the invoice ("no sé") but this ' +
      'does not block asking about payment — pivot the conversation to the payment date instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description:
            'Example: "No hay problema. ¿Sabe aproximadamente cuándo podría confirmar la fecha de pago?"',
        },
      },
      required: ['message'],
    },
  },
  SHARED_OUTCOME_TOOL,
  SHARED_CLARIFICATION_TOOL,
]

function buildInvoiceCheckSystemPrompt(client: FlowClient): string {
  return `Eres ${AGENT_NAME}, asistente virtual de ${COMPANY_NAME}, escribiendo por WhatsApp a ${client.name}.
Acabas de preguntarle: "¿Ya recibió sus facturas del mes?". Clasifica su respuesta usando EXACTAMENTE una herramienta:

- Confirma que SÍ la recibió ("sí", "ya la tengo", "claro") → mark_invoice_received.

- Dice que NO la ha recibido ("no", "aún no", "no me ha llegado") → register_outcome tipo resend_invoice. Tu mensaje DEBE ser: "Entiendo. Permítame registrar que aún no cuenta con la factura. ¿Desea que sea reenviada?".

- Dice "no sé" respecto a si la recibió (desconoce su estatus, pero no bloquea seguir) → proceed_to_payment_date. Tu mensaje debe ser: "No hay problema. ¿Sabe aproximadamente cuándo podría confirmar la fecha de pago?".

- Respuesta AMBIGUA tipo "creo que sí" (no queda claro si se refiere a la factura o al pago) → request_clarification. Tu mensaje debe ser: "Solo para confirmar, ¿se refiere a que sí recibió la factura o a que ya tiene contemplado el pago?".

Máximo 2 oraciones por mensaje. Sin emojis. Tono cálido y profesional, en español de México.`
}

// ── Step 3: payment_date — Claude + tools ───────────────────────────────────

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
            '"Para confirmar, registraré el pago por $4,500 pesos para el 15 de agosto. ¿Es correcta la información?"',
        },
      },
      required: ['date', 'amount', 'message'],
    },
  },
  SHARED_OUTCOME_TOOL,
  SHARED_CLARIFICATION_TOOL,
]

function buildPaymentDateSystemPrompt(client: FlowClient): string {
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return `Eres ${AGENT_NAME}, asistente virtual de ${COMPANY_NAME}, escribiendo por WhatsApp a ${client.name}. Hoy: ${today}.
Saldo del cliente: ${money(client.debt)} pesos.
Acabas de preguntarle: "¿Tiene contemplada alguna fecha para realizar el pago?". Clasifica su respuesta usando EXACTAMENTE una herramienta:

- FECHA y MONTO concretos y afirmativos ("el 15 de agosto por $4,500", "le pago el viernes lo que debo") → register_payment_promise.

- "Ya pagué" / "ya pagamos" (posible pago realizado) → register_outcome tipo reported_payment. Tu mensaje DEBE ser: "Gracias. ¿Me puede indicar la fecha aproximada en que se realizó el pago?". NUNCA lo registres como promesa de pago.

- "Está domiciliado" / cargo automático → register_outcome tipo domiciliado. Tu mensaje DEBE ser: "Entendido. ¿El cargo está programado para alguna fecha específica?". NUNCA lo registres como promesa normal.

- "No sé" (desconoce estatus del pago) → register_outcome tipo callback_later. Tu mensaje DEBE ser: "No hay problema. ¿Sabe aproximadamente cuándo podría confirmar la fecha de pago?".

- Respuesta AMBIGUA tipo "creo que sí" (no queda claro si ya tiene fecha contemplada) → request_clarification. Tu mensaje DEBE ser: "Solo para confirmar, ¿se refiere a que sí recibió la factura o a que ya tiene contemplado el pago?". NUNCA asumas ni registres un compromiso ante una respuesta ambigua.

- Pide tiempo para revisarlo / prefiere que le contacten después ("déjame revisarlo", "háblame después") → register_outcome tipo callback_later. Tu mensaje DEBE ser: "Claro. ¿Qué fecha y horario le convendría para volver a contactarle?".

- "No tengo fecha" (sin compromiso, sin problema evidente) → register_outcome tipo no_payment_capacity. Tu mensaje DEBE ser: "Entiendo. ¿Desea que registremos una fecha tentativa para dar seguimiento?".

- "No puedo pagar en este momento" (posible problema de pago) → register_outcome tipo no_payment_capacity. Tu mensaje DEBE ser: "Entiendo. ¿Tiene una fecha aproximada en la que considere posible realizarlo?".

- El MONTO/saldo no es correcto (disputa de saldo) → register_outcome tipo dispute_amount. Tu mensaje DEBE ser: "Entiendo. Registraré la diferencia para su revisión. ¿Me puede indicar cuál es el monto que usted tiene registrado?".

- La FACTURA está incorrecta (disputa de factura, distinto de disputar el monto) → register_outcome tipo dispute_invoice. Tu mensaje DEBE ser: "Entiendo. ¿Podría indicarme brevemente cuál es la diferencia que detectó?".

- La cuenta la ve/paga otra persona ("lo ve otra persona", "eso lo ve mi contador") → register_outcome tipo wrong_contact. Tu mensaje DEBE ser: "Entiendo. ¿Me podría indicar quién es la persona responsable de cuentas por pagar?".

- Pide que le manden/reenvíen la factura ("mándame la factura", "no la tengo") → register_outcome tipo resend_invoice. Tu mensaje DEBE ser: "Claro. Confirmamos el medio al que desea recibirla.".

- Pide hablar con una persona/asesor humano → register_outcome tipo pending_human. Tu mensaje DEBE ser: "Claro. Canalizaré su solicitud con un ejecutivo.".

- Respuesta confusa/incomprensible, o no reconoce el saldo pese a la insistencia → request_clarification. Tu mensaje DEBE ser: "Disculpe, quiero asegurarme de registrar correctamente su respuesta. ¿Me podría indicar nuevamente la fecha estimada de pago?".

Máximo 2 oraciones por mensaje. Sin emojis. Tono cálido y profesional, en español de México.`
}

// ── Reentrada: el cliente escribe después de que el guion ya había cerrado ──
// Reutiliza las mismas herramientas/reglas de payment_date — la única
// diferencia real es el encabezado del prompt (no asumimos que responde una
// pregunta puntual) y que puede optar por no hacer nada.

const STAY_CLOSED_TOOL: Anthropic.Tool = {
  name: 'acknowledge_and_stay_closed',
  description:
    'Call when the client\'s message is just a closing acknowledgment or pleasantry ("gracias", "ok", ' +
    '"de acuerdo", "👍", "perfecto", "está bien") with nothing new to address — the conversation had already ' +
    'concluded and this does not require reopening it. Do not reply; nothing further is sent.',
  input_schema: { type: 'object' as const, properties: {} },
}

const REENTRY_TOOLS: Anthropic.Tool[] = [...PAYMENT_DATE_TOOLS, STAY_CLOSED_TOOL]

function buildReentrySystemPrompt(client: FlowClient): string {
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return `Eres ${AGENT_NAME}, asistente virtual de ${COMPANY_NAME}, escribiendo por WhatsApp a ${client.name}. Hoy: ${today}.
Saldo del cliente: ${money(client.debt)} pesos.
La conversación ya se había cerrado (se agotó el guion) y el cliente acaba de volver a escribir. Lee su mensaje con atención y decide qué corresponde usando EXACTAMENTE una herramienta:

- Si es solo un agradecimiento o cierre de cortesía, sin nada nuevo que atender ("gracias", "ok", "de acuerdo", "perfecto", "👍") → acknowledge_and_stay_closed. No reinicies el guion por esto.

- Si su mensaje SÍ contiene algo que atender (una fecha y monto de pago, dice que ya pagó, pide la factura, disputa el saldo, pide hablar con alguien, etc.) → usa las mismas reglas que ya seguimos siempre:

- FECHA y MONTO concretos y afirmativos ("el 15 de agosto por $4,500", "le pago el viernes lo que debo") → register_payment_promise.

- "Ya pagué" / "ya pagamos" (posible pago realizado) → register_outcome tipo reported_payment. Tu mensaje DEBE ser: "Gracias. ¿Me puede indicar la fecha aproximada en que se realizó el pago?". NUNCA lo registres como promesa de pago.

- "Está domiciliado" / cargo automático → register_outcome tipo domiciliado. Tu mensaje DEBE ser: "Entendido. ¿El cargo está programado para alguna fecha específica?". NUNCA lo registres como promesa normal.

- Pide tiempo para revisarlo / prefiere que le contacten después → register_outcome tipo callback_later. Tu mensaje DEBE ser: "Claro. ¿Qué fecha y horario le convendría para volver a contactarle?".

- No puede pagar en este momento o no tiene fecha → register_outcome tipo no_payment_capacity. Tu mensaje DEBE ser: "Entiendo. ¿Tiene una fecha aproximada en la que considere posible realizarlo?".

- El MONTO/saldo no es correcto (disputa de saldo) → register_outcome tipo dispute_amount. Tu mensaje DEBE ser: "Entiendo. Registraré la diferencia para su revisión. ¿Me puede indicar cuál es el monto que usted tiene registrado?".

- La FACTURA está incorrecta → register_outcome tipo dispute_invoice. Tu mensaje DEBE ser: "Entiendo. ¿Podría indicarme brevemente cuál es la diferencia que detectó?".

- La cuenta la ve/paga otra persona → register_outcome tipo wrong_contact. Tu mensaje DEBE ser: "Entiendo. ¿Me podría indicar quién es la persona responsable de cuentas por pagar?".

- Pide que le manden/reenvíen la factura, o dice que no la ha recibido → register_outcome tipo resend_invoice. Tu mensaje DEBE ser: "Claro. Confirmamos el medio al que desea recibirla.".

- Pide hablar con una persona/asesor humano → register_outcome tipo pending_human. Tu mensaje DEBE ser: "Claro. Canalizaré su solicitud con un ejecutivo.".

- Respuesta confusa/incomprensible → request_clarification, pidiendo que aclare qué necesita.

Máximo 2 oraciones por mensaje. Sin emojis. Tono cálido y profesional, en español de México.`
}

// ── Steps 4 y 5: confirming / final_confirming — Claude + tool (compartido) ─

const CONFIRM_TOOLS: Anthropic.Tool[] = [
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
            'Your reply, in natural spoken Spanish. If correct=false, restate the new amount/date IN WORDS ' +
            '(e.g. "el 20 de agosto", never "2026-08-20") and ask to confirm again.',
        },
      },
      required: ['correct', 'message'],
    },
  },
]

function buildConfirmSystemPrompt(context: FlowContext, tense: 'future' | 'past'): string {
  const amount = context.pendingAmount ?? 0
  const date = context.pendingDate ? formatDateWords(context.pendingDate) : ''
  const restated =
    tense === 'future'
      ? `Para confirmar, registraré el pago por ${money(amount)} pesos para el ${date}. ¿Es correcta la información?`
      : `Para confirmar, he registrado el pago por ${money(amount)} pesos para el ${date}. ¿Es correcta esta información?`

  return `Eres ${AGENT_NAME}, asistente virtual de ${COMPANY_NAME}, escribiendo por WhatsApp.
Ya le dijiste al cliente: "${restated}" y esperas su respuesta.

- Si confirma ("sí", "es correcto", "así es") → confirm_agreement con correct=true. Tu mensaje debe ser simplemente una confirmación breve (ej. "Perfecto, gracias.") — el cierre final lo maneja el sistema, no lo repitas tú.
- Si corrige el monto o la fecha → confirm_agreement con correct=false y los valores corregidos que haya dado (deja el otro campo vacío si no lo corrigió). Tu mensaje debe repetir la nueva intención en palabras y volver a pedir confirmación.
- Si dice que no sin dar una corrección clara → confirm_agreement con correct=false, sin nuevos valores. Pregunta amablemente cuál es el monto o la fecha correctos.

Máximo 2 oraciones. Sin emojis. Tono cálido y profesional, en español de México.`
}

const FINAL_CLOSING_MESSAGE =
  `Queda registrado. Muchas gracias por su tiempo. Le atendió ${AGENT_NAME}, asistente virtual de ${COMPANY_NAME}. Que tenga excelente día.`

// Cuando Claude no llama ninguna herramienta, es porque el mensaje no encajó
// en ninguna rama del guion (p.ej. algo totalmente ajeno a cobranza). NUNCA
// usamos el texto libre que Claude haya generado en ese caso — por más
// inocente que parezca, es la puerta de entrada para que el bot se salga de
// personaje (contestar tareas, chistes, lo que sea). Siempre redirige igual.
const OFF_TOPIC_REDIRECT =
  'Solo puedo ayudarte con lo relacionado a tu cuenta o factura pendiente. ¿Hay algo de eso en lo que te pueda asistir?'

// ── Main entry point ─────────────────────────────────────────────────────

function firstToolUse(response: Anthropic.Message): Anthropic.ToolUseBlock | undefined {
  return response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
}

// Maneja una respuesta de register_outcome/request_clarification, compartido
// entre invoice_check y payment_date.
function handleOutcomeToolUse(
  toolUse: Anthropic.ToolUseBlock,
  context: FlowContext
): FlowResult | null {
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

  return null
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
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: buildInvoiceCheckSystemPrompt(client),
      tools: INVOICE_CHECK_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: text }],
    })

    const toolUse = firstToolUse(response)

    if (!toolUse) {
      return {
        reply: OFF_TOPIC_REDIRECT,
        newState: 'invoice_check',
        newContext: context,
        closeConversation: false,
      }
    }

    if (toolUse.name === 'mark_invoice_received') {
      return {
        reply: `Perfecto. El saldo correspondiente es de ${money(client.debt)} pesos. ¿Tiene contemplada alguna fecha para realizar el pago?`,
        newState: 'payment_date',
        newContext: context,
        closeConversation: false,
      }
    }

    if (toolUse.name === 'proceed_to_payment_date') {
      const input = toolUse.input as { message: string }
      return {
        reply: input.message,
        newState: 'payment_date',
        newContext: context,
        closeConversation: false,
      }
    }

    const outcomeResult = handleOutcomeToolUse(toolUse, context)
    if (outcomeResult) return outcomeResult
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
        reply: OFF_TOPIC_REDIRECT,
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

    const outcomeResult = handleOutcomeToolUse(toolUse, context)
    if (outcomeResult) return outcomeResult
  }

  // --- STEP 4: confirming (primera confirmación, tiempo futuro) ---
  if (effectiveState === 'confirming') {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: buildConfirmSystemPrompt(context, 'future'),
      tools: CONFIRM_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: text }],
    })

    const toolUse = firstToolUse(response)

    if (!toolUse || toolUse.name !== 'confirm_agreement') {
      return {
        reply: OFF_TOPIC_REDIRECT,
        newState: 'confirming',
        newContext: context,
        closeConversation: false,
      }
    }

    const input = toolUse.input as { correct: boolean; date?: string; amount?: number; message: string }

    if (input.correct) {
      const amount = context.pendingAmount ?? 0
      const date = context.pendingDate ? formatDateWords(context.pendingDate) : ''
      return {
        reply: `Para confirmar, he registrado el pago por ${money(amount)} pesos para el ${date}. ¿Es correcta esta información?`,
        newState: 'final_confirming',
        newContext: context,
        closeConversation: false,
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

  // --- STEP 5: final_confirming (repetición y confirmación final, tiempo pasado) ---
  if (effectiveState === 'final_confirming') {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: buildConfirmSystemPrompt(context, 'past'),
      tools: CONFIRM_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: text }],
    })

    const toolUse = firstToolUse(response)

    if (!toolUse || toolUse.name !== 'confirm_agreement') {
      return {
        reply: OFF_TOPIC_REDIRECT,
        newState: 'final_confirming',
        newContext: context,
        closeConversation: false,
      }
    }

    const input = toolUse.input as { correct: boolean; date?: string; amount?: number; message: string }

    if (input.correct) {
      const amount = context.pendingAmount ?? 0
      const date = context.pendingDate ? new Date(context.pendingDate) : new Date()
      return {
        reply: FINAL_CLOSING_MESSAGE,
        newState: 'closed',
        newContext: {},
        closeConversation: true,
        outcome: { type: 'payment_promise', amount, date },
        createPromise: { amount, date },
      }
    }

    return {
      reply: input.message,
      newState: 'final_confirming',
      newContext: {
        ...context,
        pendingAmount: input.amount ?? context.pendingAmount,
        pendingDate: input.date ?? context.pendingDate,
      },
      closeConversation: false,
    }
  }

  // --- STEP reentrada: el cliente escribió después de que el guion había cerrado ---
  if (effectiveState === 'closed' && context.checkingReentry) {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: buildReentrySystemPrompt(client),
      tools: REENTRY_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: text }],
    })

    const toolUse = firstToolUse(response)

    // Agradecimiento/cortesía genuina — se queda cerrado, sin contestar nada.
    if (toolUse?.name === 'acknowledge_and_stay_closed') {
      return { reply: '', newState: 'closed', newContext: {}, closeConversation: true }
    }

    // No encajó en nada (ni siquiera es una cortesía) — redirige, sigue cerrado.
    if (!toolUse) {
      return { reply: OFF_TOPIC_REDIRECT, newState: 'closed', newContext: {}, closeConversation: true }
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

    const outcomeResult = handleOutcomeToolUse(toolUse, {})
    if (outcomeResult) return outcomeResult

    return { reply: '', newState: 'closed', newContext: {}, closeConversation: true }
  }

  // --- closed / unexpected state: no-op ---
  return { reply: '', newState: 'closed', newContext: context, closeConversation: true }
}
