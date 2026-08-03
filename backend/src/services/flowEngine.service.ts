import { HydratedDocument } from 'mongoose'
import flowJson from '../flows/cobranza_ai_v1.json'
import Client from '../models/Client'
import { ICall } from '../models/Call'
import { runAction } from './flowActions.service'
import { classifyIntent, extractCommitment, verifyNameMatch } from './claudeVoice.service'
import {
  FlowDefinition,
  FlowState,
  FlowContext,
  CollectState,
  DecisionState,
  IntentState,
} from '../types/flow'

const flow = flowJson as unknown as FlowDefinition
const statesById = new Map<string, FlowState>(flow.states.map((s) => [s.id, s]))

export const FLOW_START_STATE = flow.start_state

export type EngineStop =
  | { kind: 'collect'; stateId: string; say: string }
  | { kind: 'intent'; stateId: string; say: string }
  | { kind: 'terminal'; say: string; requiresHuman: boolean }

export type ResumeResult =
  | { kind: 'advance'; nextStateId: string }
  | { kind: 'reprompt'; message: string }

function joinSpeech(parts: string[]): string {
  return parts.filter((p) => p && p.trim()).join(' ')
}

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  return `${amount.toLocaleString('es-MX')} pesos`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
}

function renderTemplate(template: string, ctx: FlowContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = ctx[key]
    if (value === undefined || value === null || value === '') return ''
    if (key === 'balance' || key === 'amount') return formatCurrency(Number(value))
    if (key === 'payment_date') return formatDate(String(value))
    return String(value)
  })
}

function evalCondition(condition: string, ctx: FlowContext): boolean {
  const match = condition.match(/^(\w+)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)$/)
  if (match) {
    const [, field, op, numStr] = match
    const val = Number(ctx[field] ?? 0)
    const num = Number(numStr)
    switch (op) {
      case '>=':
        return val >= num
      case '<=':
        return val <= num
      case '>':
        return val > num
      case '<':
        return val < num
      case '==':
        return val === num
    }
  }
  return Boolean(ctx[condition.trim()])
}

function evalDecision(state: DecisionState, ctx: FlowContext): string {
  if (state.condition) {
    const result = evalCondition(state.condition, ctx)
    const nextId = result ? state.true : state.false
    if (!nextId) {
      console.error(`[FlowEngine] decision "${state.id}" sin rama ${result ? 'true' : 'false'} definida`)
      return state.id
    }
    return nextId
  }

  if (state.field && state.rules) {
    const val = Number(ctx[state.field] ?? 0)
    const rule = state.rules.find(
      (r) => (r.min === undefined || val >= r.min) && (r.max === undefined || val <= r.max)
    )
    if (rule) return rule.next

    // Ninguna regla cubre el valor (ej. días de mora fuera de los rangos definidos en el
    // JSON del cliente) — se usa la última regla (la más severa) como respaldo en vez de
    // romper la llamada.
    console.warn(
      `[FlowEngine] decision "${state.id}": valor ${val} de "${state.field}" no cae en ninguna regla, usando último rango como fallback`
    )
    return state.rules[state.rules.length - 1]?.next ?? state.id
  }

  console.error(`[FlowEngine] decision "${state.id}" no tiene "condition" ni "field"/"rules"`)
  return state.id
}

// Camina por los estados que no requieren al cliente (message/api_call/decision) y se
// detiene en el primer estado interactivo (collect/intent) o terminal (end/transfer).
export async function advance(
  stateId: string,
  ctx: FlowContext,
  call: HydratedDocument<ICall>
): Promise<EngineStop> {
  let current = statesById.get(stateId)
  const pending: string[] = []
  let guard = 0

  while (current) {
    if (++guard > 40) {
      console.error(`[FlowEngine] Límite de saltos alcanzado cerca de "${current.id}" — posible ciclo en el JSON`)
      break
    }

    if (current.type === 'message') {
      const text = current.dynamic && current.template ? renderTemplate(current.template, ctx) : current.text ?? ''
      pending.push(text)
      current = statesById.get(current.next)
      continue
    }

    if (current.type === 'api_call') {
      const result = await runAction(current.service, current.action, ctx, call)
      if (result) Object.assign(ctx, result)
      current = statesById.get(current.next)
      continue
    }

    if (current.type === 'decision') {
      current = statesById.get(evalDecision(current, ctx))
      continue
    }

    if (current.type === 'collect') {
      pending.push(current.prompt)
      return { kind: 'collect', stateId: current.id, say: joinSpeech(pending) }
    }

    if (current.type === 'intent') {
      return { kind: 'intent', stateId: current.id, say: joinSpeech(pending) }
    }

    if (current.type === 'transfer') {
      pending.push(
        'Permítame comunicarlo con un asesor, en breve se pondrán en contacto con usted. Gracias por su tiempo.'
      )
      return { kind: 'terminal', say: joinSpeech(pending), requiresHuman: true }
    }

    if (current.type === 'end') {
      pending.push(current.text)
      return { kind: 'terminal', say: joinSpeech(pending), requiresHuman: false }
    }

    break
  }

  // El JSON no definió a dónde ir (next inexistente, ciclo, etc.) — cerramos con
  // cortesía en vez de dejar la llamada en un estado indefinido.
  return {
    kind: 'terminal',
    say: joinSpeech(pending) || 'Gracias por su tiempo, que tenga buen día.',
    requiresHuman: false,
  }
}

async function resumeCollect(
  state: CollectState,
  speechResult: string,
  ctx: FlowContext,
  call: HydratedDocument<ICall>
): Promise<ResumeResult> {
  if (state.validation?.type === 'identity') {
    const client = call.clientId ? await Client.findById(call.clientId).lean() : null

    if (!client) {
      console.log(
        `[FlowEngine] verify_identity: la llamada (callSid=${call.callSid}, phone=${call.phone}) no tiene clientId asociado — no hay nombre contra qué comparar, siempre falla.`
      )
    }

    // Bandera temporal de prueba: salta la comparación de nombre (que depende de que la
    // transcripción de voz sea perfecta) para poder validar el resto del flujo — saldo,
    // captura de promesa de pago — sin quedarse atorado aquí. Quitar antes de producción real.
    const skipCheck = process.env.SKIP_IDENTITY_CHECK === 'true'
    const matched = skipCheck ? true : client?.name ? await verifyNameMatch(speechResult, client.name as string) : false
    console.log(
      `[FlowEngine] verify_identity: dijo "${speechResult}" | nombre registrado="${client?.name ?? 'N/A'}" | coincide=${matched}${skipCheck ? ' (SKIP_IDENTITY_CHECK activo)' : ''}`
    )

    if (matched) {
      ctx.identity_verified = true
      return { kind: 'advance', nextStateId: state.validation.on_success }
    }

    ctx.attempts = (Number(ctx.attempts) || 0) + 1
    return { kind: 'advance', nextStateId: state.validation.on_failure }
  }

  // Collect genérico (ej. "¿qué fecha estima pagar?"): se guarda la respuesta cruda y se
  // usa Claude para extraer monto/fecha estructurados, que necesita save_commitment.
  ctx[state.id] = speechResult
  const today = new Date().toISOString().slice(0, 10)
  const extraction = await extractCommitment(speechResult, today)

  if (extraction.paymentDate) {
    ctx.payment_date = extraction.paymentDate
  } else if (!ctx.payment_date) {
    const fallback = new Date()
    fallback.setDate(fallback.getDate() + 7)
    ctx.payment_date = fallback.toISOString().slice(0, 10)
  }

  if (extraction.amount !== null) {
    ctx.amount = extraction.amount
  } else if (ctx.amount === undefined || ctx.amount === null) {
    ctx.amount = ctx.balance ?? 0
  }

  return { kind: 'advance', nextStateId: state.next as string }
}

async function resumeIntent(state: IntentState, speechResult: string): Promise<ResumeResult> {
  const label = await classifyIntent(speechResult, state.intents)

  if (!label) {
    return { kind: 'reprompt', message: 'Disculpe, no logré entender. ¿Podría repetirlo, por favor?' }
  }

  return { kind: 'advance', nextStateId: state.intents[label] }
}

// Procesa la respuesta hablada del cliente para el estado interactivo en curso
// (collect o intent) y decide a qué estado saltar después.
export async function resume(
  stateId: string,
  speechResult: string,
  ctx: FlowContext,
  call: HydratedDocument<ICall>
): Promise<ResumeResult> {
  const state = statesById.get(stateId)
  if (!state) {
    console.error(`[FlowEngine] resume(): el estado "${stateId}" no existe en el flujo, reiniciando`)
    return { kind: 'advance', nextStateId: FLOW_START_STATE }
  }

  if (state.type === 'collect') return resumeCollect(state, speechResult, ctx, call)
  if (state.type === 'intent') return resumeIntent(state, speechResult)

  console.error(`[FlowEngine] resume() invocado sobre un estado no interactivo: "${stateId}"`)
  return { kind: 'advance', nextStateId: state.id }
}
