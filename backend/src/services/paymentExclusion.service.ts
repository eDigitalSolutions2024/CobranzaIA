// Exclusión mensual por pago: un cliente que registró algo de pago (promesa, pago en proceso o pago recibido; NO una
// negativa) sale de las llamadas automáticas hasta fin del mes en curso, porque las facturas son mensuales. Usa los
// mismos campos de la exclusión que ya existía (Client.collectionExcludedUntil / collectionExclusionReason), que el
// scheduler ya respeta; al cambiar de mes vence sola. No toca debt/status ni confirma el pago.
import mongoose from 'mongoose'
import Call from '../models/Call'
import Client from '../models/Client'
import PaymentPromise from '../models/PaymentPromise'
import { endOfCurrentMonthMexicoCity } from '../utils/collectionExclusion'

// Con este motivo el recordatorio de la promesa se sigue enviando (ver reminderScheduler.service.ts)
export const PROMISE_EXCLUSION_REASON = 'Promesa de pago'

const REASON_BY_DISPOSITION: Record<string, string> = {
  'Payment scheduled': PROMISE_EXCLUSION_REASON,
  'Payment in process': 'Pago en proceso',
  'Payment received': 'Pago reportado',
}

export const PAYMENT_DISPOSITIONS = Object.keys(REASON_BY_DISPOSITION)

export function paymentExclusionReason(disposition: string): string | null {
  return REASON_BY_DISPOSITION[disposition] ?? null
}

// Solo si no está ya excluido: no se pisa un motivo más preciso (ej. "Pago en proceso — tesorería")
function notCurrentlyExcluded(now: Date) {
  return { $or: [{ collectionExcludedUntil: null }, { collectionExcludedUntil: { $lte: now } }] }
}

export async function excludeForPayment(clientId: mongoose.Types.ObjectId | string, reason: string): Promise<void> {
  const now = new Date()
  await Client.updateOne(
    { _id: clientId, ...notCurrentlyExcluded(now) },
    { collectionExcludedUntil: endOfCurrentMonthMexicoCity(), collectionExclusionReason: reason, collectionExcludedAt: now }
  )
}

// Día 1 del mes en curso a las 00:00 hora CDMX (UTC-6, sin horario de verano desde 2022)
function startOfCurrentMonthMexicoCity(now: Date): Date {
  const wall = new Date(now.getTime() - 6 * 3600_000)
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1, 6))
}

// Excluye a quienes ya habían registrado un pago este mes antes de existir esta regla (o si algo se quedó sin marcar).
// Se corre al arrancar el servidor; es idempotente y nunca toca a quien su última llamada fue una negativa.
export async function syncPaymentExclusions(): Promise<number> {
  const now = new Date()
  const since = startOfCurrentMonthMexicoCity(now)
  // Exclusiones de este mes guardadas con el fin de mes anterior (vencían a las 17:59 CDMX): hasta las 23:59 CDMX
  const monthEnd = endOfCurrentMonthMexicoCity()
  await Client.updateMany(
    { collectionExcludedUntil: new Date(monthEnd.getTime() - 6 * 3600_000) },
    { collectionExcludedUntil: monthEnd }
  )
  const [calls, promises] = await Promise.all([
    Call.find({ createdAt: { $gte: since }, disposition: { $in: PAYMENT_DISPOSITIONS }, clientId: { $ne: null } })
      .sort({ createdAt: -1 })
      .select('clientId disposition')
      .lean(),
    PaymentPromise.distinct('clientId', { createdAt: { $gte: since } }),
  ])

  // La llamada de pago más reciente de cada cliente define el motivo; las promesas sin llamada (WhatsApp) son promesa
  const reasons = new Map<string, string>()
  for (const call of calls) {
    const id = String(call.clientId)
    if (!reasons.has(id)) reasons.set(id, REASON_BY_DISPOSITION[call.disposition as string])
  }
  for (const id of promises) if (id && !reasons.has(String(id))) reasons.set(String(id), PROMISE_EXCLUSION_REASON)

  let excluded = 0
  for (const [id, reason] of reasons) {
    const result = await Client.updateOne(
      { _id: id, lastCallDisposition: { $ne: 'Payment refused' }, ...notCurrentlyExcluded(now) },
      { collectionExcludedUntil: endOfCurrentMonthMexicoCity(), collectionExclusionReason: reason, collectionExcludedAt: now }
    )
    excluded += result.modifiedCount
  }
  return excluded
}
