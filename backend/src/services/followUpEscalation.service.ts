// Segundo intento para las llamadas en "Follow up" y escalamiento a Collector Assistance.
//
//  - Una llamada termina en Follow up (el cliente pidió que le llamen después, o hay un nuevo responsable de
//    pagos): se abre un seguimiento en el cliente y se agenda el segundo intento (la hora que pidió el cliente,
//    o el siguiente día hábil a las 10:00 CDMX). La llamada sale como triggeredBy 'followup'
//    (ver dispatchScheduledCallbacks en autoCallScheduler.service.ts).
//  - Resultado del segundo intento: resuelto → disposición normal y se cierra el seguimiento; sin solución
//    (otra vez Follow up, o hubo contacto sin resolver) → Collector Assistance; sin contestar → un reintento
//    el siguiente día hábil y, si vuelve a fallar, Collector Assistance.
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
      notes: `Seguimiento sin solución tras 2 intentos del agente (resultado del segundo intento: ${originalDisposition}). Pasa a un gestor humano.`,
    })
  }
  console.log(`[FollowUp] Cliente ${clientId} asignado a Collector Assistance (${reason})`)
}

// Aplica las reglas de seguimiento a una llamada ya clasificada. Devuelve la disposición final (puede cambiar a
// Collector Assistance cuando se escala).
export async function applyFollowUpRules(call: CallLike, disposition: DispositionStatus): Promise<DispositionStatus> {
  if (!call.clientId) return disposition

  // Collector Assistance ya asignada por el agente: se registra el motivo (disputa o petición del cliente)
  if (disposition === COLLECTOR_ASSISTANCE) {
    const reason: EscalationReason = (call.calledFunctions ?? []).includes('marcar_ticket_aclaracion') ? 'dispute' : 'customer_request'
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
    await Client.findByIdAndUpdate(call.clientId, {
      followUp: { attempt: 1, sourceCallId: call._id, nextAt, noAnswerRetries: 0 },
      ...(requested ? {} : { scheduledCallbackAt: nextAt, scheduledCallbackReason: 'Seguimiento (segundo intento)' }),
    })
    console.log(`[FollowUp] Seguimiento abierto; segundo intento ${nextAt.toISOString()}`)
  }
  return disposition
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
