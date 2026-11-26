// Segundo intento para las llamadas en "Follow up" y escalamiento a Collector Assistance.
//
//  - Una llamada termina en Follow up (el cliente pidió que le llamen después, o hay un nuevo responsable de
//    pagos): se abre un seguimiento en el cliente y se agenda el segundo intento (la hora que pidió el cliente,
//    o el siguiente día hábil a las 10:00 CDMX). La llamada sale como triggeredBy 'followup', con instrucciones
//    para resolver lo pendiente (ver buildFollowUpNote), y cuenta en Auto Outreach (ver planCallback).
//  - Resultado del segundo intento: resuelto → disposición normal y se cierra el seguimiento; sin solución
//    (otra vez Follow up, contacto sin resolver o el agente pide un asesor) → Collector Assistance; sin contestar
//    → un reintento el siguiente día hábil y, si vuelve a fallar, Collector Assistance.
//  - Una disputa (el agente llamó a marcar_ticket_aclaracion) va directo a Collector Assistance, sin segundo intento.
//  - Collector Assistance ('Prefers CAS support') ya existía: el motivo (escalationReason) distingue de dónde viene.
//
// Un cliente con collectorAssignedAt queda fuera del ciclo automático y de las llamadas agendadas hasta que el
// gestor lo libere o arranque el mes siguiente (ver releaseCollectorCases).
import mongoose from 'mongoose'
import Call from '../models/Call'
import Client from '../models/Client'
import Ticket from '../models/Ticket'
import { DispositionStatus, nextActionFor } from '../config/disposition'

export type EscalationReason = 'dispute' | 'customer_request' | 'followup_unresolved'

const COLLECTOR_ASSISTANCE: DispositionStatus = 'Prefers CAS support'

// No se llegó a la persona: el segundo intento se repite una vez antes de escalar
const NO_CONTACT: ReadonlySet<DispositionStatus> = new Set(['No answer', 'Voice mail', 'Customer hung up', 'Extension required'])
// Hubo conversación pero sigue sin solución: se escala
const UNRESOLVED: ReadonlySet<DispositionStatus> = new Set(['Follow up', 'Contact made - No resolution'])

const MEXICO_OFFSET_MS = 6 * 3600_000 // CDMX sin horario de verano desde 2022

// Siguiente día hábil (lun-vie) a las 10:00 hora CDMX, como instante UTC
export function nextBusinessDayAt10(from: Date = new Date()): Date {
  const wall = new Date(from.getTime() - MEXICO_OFFSET_MS)
  do {
    wall.setUTCDate(wall.getUTCDate() + 1)
  } while (wall.getUTCDay() === 0 || wall.getUTCDay() === 6)
  wall.setUTCHours(10, 0, 0, 0)
  return new Date(wall.getTime() + MEXICO_OFFSET_MS)
}

// Lunes de la semana siguiente a las 10:00 hora CDMX, como instante UTC
export function nextMondayAt10(from: Date = new Date()): Date {
  const wall = new Date(from.getTime() - MEXICO_OFFSET_MS)
  do {
    wall.setUTCDate(wall.getUTCDate() + 1)
  } while (wall.getUTCDay() !== 1)
  wall.setUTCHours(10, 0, 0, 0)
  return new Date(wall.getTime() + MEXICO_OFFSET_MS)
}

export type CallbackPlan =
  // Se llama ahora y cuenta en Auto Outreach como el intento `attempt` de la semana
  | { action: 'call'; attempt: number; newWeek: boolean }
  // Ya no quedan llamadas esta semana: pasa al lunes
  | { action: 'defer'; until: Date }

// Cómo cuenta una llamada agendada (rellamada o segundo intento de Follow up) dentro de Auto Outreach. Por semana
// hay como máximo 2 llamadas (los pasos 3 y 4 del ciclo son WhatsApp), o menos si AUTO_CYCLE_STEPS es 1. Única
// excepción al límite: la hora que pidió el propio cliente se respeta (y también cuenta).
export function planCallback(input: {
  now: Date
  weekStart: Date
  cycleStartAt: Date | null | undefined
  attempt: number
  cycleSteps: number
  requestedByCustomer: boolean
}): CallbackPlan {
  const newWeek = !input.cycleStartAt || input.cycleStartAt < input.weekStart
  const used = newWeek ? 0 : input.attempt
  const weeklyCalls = Math.min(input.cycleSteps, 2)
  if (used >= weeklyCalls && !input.requestedByCustomer) return { action: 'defer', until: nextMondayAt10(input.now) }
  return { action: 'call', attempt: used + 1, newWeek }
}

interface CallLike {
  _id: mongoose.Types.ObjectId
  clientId?: mongoose.Types.ObjectId | null
  phone: string
  triggeredBy: string
  calledFunctions?: string[]
}

async function escalateToCollector(call: CallLike, reason: EscalationReason, overrideDisposition: DispositionStatus | null, originalDisposition: DispositionStatus): Promise<void> {
  const clientId = call.clientId
  await Call.findByIdAndUpdate(call._id, {
    escalationReason: reason,
    ...(overrideDisposition ? { disposition: overrideDisposition, nextAction: nextActionFor(overrideDisposition), originalDisposition } : {}),
  })
  if (!clientId) return
  await Client.findByIdAndUpdate(clientId, {
    collectorAssignedAt: new Date(),
    escalationReason: reason,
    followUp: null,
    scheduledCallbackAt: null,
    scheduledCallbackReason: null,
    autoCallNextAttemptAt: null,
    ...(overrideDisposition ? { lastCallDisposition: overrideDisposition, nextAction: nextActionFor(overrideDisposition) } : {}),
  })
  if (reason === 'followup_unresolved') {
    await Ticket.create({
      clientId,
      callId: call._id,
      phone: call.phone,
      reason: 'collector_escalation',
      status: 'open',
      notes: `Seguimiento sin solución después del segundo intento del agente (resultado: ${originalDisposition}). Pasa a un gestor humano.`,
    })
  }
  console.log(`[FollowUp] Cliente ${clientId} asignado a Collector Assistance (${reason})`)
}

// Aplica las reglas de seguimiento a una llamada ya clasificada. Devuelve la disposición final (puede cambiar a
// Collector Assistance cuando se escala).
export async function applyFollowUpRules(call: CallLike, disposition: DispositionStatus): Promise<DispositionStatus> {
  if (!call.clientId) return disposition

  // Collector Assistance ya asignada por el agente: se registra el motivo. En el segundo intento, pedir un asesor
  // significa que el agente no pudo resolverlo.
  if (disposition === COLLECTOR_ASSISTANCE) {
    const reason: EscalationReason = (call.calledFunctions ?? []).includes('marcar_ticket_aclaracion')
      ? 'dispute'
      : call.triggeredBy === 'followup' ? 'followup_unresolved' : 'customer_request'
    await escalateToCollector(call, reason, null, disposition)
    return disposition
  }

  if (call.triggeredBy === 'followup') {
    if (NO_CONTACT.has(disposition)) {
      const client = await Client.findById(call.clientId).select('followUp').lean()
      const retries = (client?.followUp?.noAnswerRetries as number | undefined) ?? 0
      if (retries < 1) {
        const nextAt = nextBusinessDayAt10()
        await Client.findByIdAndUpdate(call.clientId, {
          'followUp.attempt': 2,
          'followUp.noAnswerRetries': retries + 1,
          'followUp.nextAt': nextAt,
          // El reintento ya no es una hora que haya pedido el cliente: respeta el límite semanal
          'followUp.requestedByCustomer': false,
          scheduledCallbackAt: nextAt,
          scheduledCallbackReason: 'Seguimiento (segundo intento, reintento)',
        })
        console.log(`[FollowUp] Segundo intento sin contacto (${disposition}); se reintenta ${nextAt.toISOString()}`)
        return disposition
      }
    } else if (!UNRESOLVED.has(disposition)) {
      // Resuelto (promesa, pago, negativa, facturas, teléfono…): se cierra el seguimiento
      await Client.findByIdAndUpdate(call.clientId, { followUp: null })
      return disposition
    }
    await escalateToCollector(call, 'followup_unresolved', COLLECTOR_ASSISTANCE, disposition)
    return COLLECTOR_ASSISTANCE
  }

  if (disposition === 'Follow up') {
    const client = await Client.findById(call.clientId).select('scheduledCallbackAt').lean()
    // La hora que pidió el cliente (programar_llamada ya la guardó); si no dio una, el siguiente día hábil
    const requested = client?.scheduledCallbackAt as Date | null | undefined
    const nextAt = requested ?? nextBusinessDayAt10()
    await Call.findByIdAndUpdate(call._id, { followUpAttempt: 1 })
    await Client.findByIdAndUpdate(call.clientId, {
      followUp: { attempt: 1, sourceCallId: call._id, nextAt, noAnswerRetries: 0, requestedByCustomer: Boolean(requested) },
      ...(requested ? {} : { scheduledCallbackAt: nextAt, scheduledCallbackReason: 'Seguimiento (segundo intento)' }),
    })
    console.log(`[FollowUp] Seguimiento abierto; segundo intento ${nextAt.toISOString()}`)
  } else if (!NO_CONTACT.has(disposition) && !UNRESOLVED.has(disposition)) {
    // Se resolvió por otra llamada (ej. una manual) antes del segundo intento: ya no hace falta
    await Client.updateOne(
      { _id: call.clientId, followUp: { $ne: null } },
      { followUp: null, scheduledCallbackAt: null, scheduledCallbackReason: null }
    )
  }
  return disposition
}

// Instrucciones para el agente en el segundo intento: qué quedó pendiente y qué hacer si no puede resolverlo.
export async function buildFollowUpNote(call: { triggeredBy: string; followUpOfCallId?: mongoose.Types.ObjectId | null }): Promise<string | null> {
  if (call.triggeredBy !== 'followup') return null
  const source = call.followUpOfCallId
    ? await Call.findById(call.followUpOfCallId).select('summary createdAt').lean().catch(() => null)
    : null
  const summary = source?.summary && !/unavailable/i.test(source.summary as string) ? (source.summary as string).trim() : null
  const when = source?.createdAt
    ? new Date(source.createdAt as Date).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long' })
    : null

  return `LLAMADA DE SEGUIMIENTO (segundo intento) — esto tiene prioridad sobre el flujo de arriba:
Ya se llamó antes a esta empresa${when ? ` (el ${when})` : ''} y quedó un asunto pendiente.${summary ? ` Resumen de esa llamada: "${summary}"` : ' No hay resumen de esa llamada.'}
Tu objetivo es RESOLVER ese pendiente en esta llamada.
- Confirma con quién hablas igual que siempre. Con recepción o terceros sigue el PROTOCOLO DE RECEPCIÓN: no menciones deuda ni el resumen.
- Cuando confirmes que es la persona correcta, preséntate y di: "Le llamo para dar seguimiento a lo que quedó pendiente en nuestra llamada anterior." No repitas preguntas que ya se contestaron.
- Busca un resultado concreto y regístralo con su función: fecha de pago por el saldo completo (confírmala una vez), pago ya realizado o en proceso, o los documentos que necesite.
- Si NO puedes resolverlo (no hay fecha, pide algo que no puedes hacer, no sabe o quiere que se le llame otra vez), NO agendes otra llamada: dile que un asesor se pondrá en contacto, llama a requerir_humano y despídete.`
}

// Libera a los clientes asignados a Collector Assistance (lo corre el gestor, o el cambio de mes: las facturas
// son mensuales). Devuelve cuántos liberó.
export async function releaseCollectorCases(filter: Record<string, unknown> = {}): Promise<number> {
  const result = await Client.updateMany(
    { collectorAssignedAt: { $ne: null }, ...filter },
    { $set: { collectorAssignedAt: null, escalationReason: null, followUp: null } }
  )
  return result.modifiedCount
}
