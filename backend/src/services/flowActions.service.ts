import { HydratedDocument, Types } from 'mongoose'
import Client from '../models/Client'
import PaymentPromise from '../models/PaymentPromise'
import Reminder from '../models/Reminder'
import Ticket from '../models/Ticket'
import { ICall } from '../models/Call'
import { prepareWhatsappMessage } from './whatsappService'
import { verifyPayment } from './paymentsProvider.service'
import { FlowContext } from '../types/flow'
import { endOfCurrentMonthMexicoCity } from '../utils/collectionExclusion'

type ActionFn = (ctx: FlowContext, call: HydratedDocument<ICall>) => Promise<Partial<FlowContext> | void>

// Pausa el ciclo automático (autoCallScheduler.service.ts / reminderScheduler.service.ts)
// hasta fin del mes en curso — ver tarjeta "Exclusión automática de clientes del ciclo
// mensual de cobranza". NUNCA marca el pago como confirmado ni toca `debt`/`status` — eso
// solo lo hace una verificación real (import de facturas, o crm.close_case). Usada por
// las 3 acciones de abajo que representan los 4 escenarios de la tarjeta (pago
// reportado/en proceso comparten la misma acción con distinto motivo, domiciliado es
// aparte porque ya tenía su propio manejo de Ticket).
async function excludeFromCollection(clientId: Types.ObjectId | null | undefined, reason: string): Promise<void> {
  if (!clientId) return
  await Client.findByIdAndUpdate(clientId, {
    collectionExcludedUntil: endOfCurrentMonthMexicoCity(),
    collectionExclusionReason: reason,
    collectionExcludedAt: new Date(),
  })
}

// Registro service.action -> implementación real. Cada handler recibe el contexto
// acumulado de la llamada y puede devolver variables nuevas que se mezclan en él.
const registry: Record<string, ActionFn> = {
  'crm.get_account': async (_ctx, call) => {
    if (!call.clientId) {
      return { balance: 0, invoice_count: 0, days_overdue: 0 }
    }
    const client = await Client.findById(call.clientId).lean()
    return {
      balance: client?.debt ?? 0,
      // No hay conteo de facturas individuales en el modelo actual — se usa 1 como
      // placeholder razonable. Si el cliente maneja facturas separadas, habría que
      // agregar esa relación al modelo Client/Invoice.
      invoice_count: 1,
      days_overdue: client?.agingDays ?? 0,
    }
  },

  'crm.create_payment_commitment': async (ctx, call) => {
    if (!call.clientId) return
    await PaymentPromise.create({
      clientId: call.clientId,
      amount: ctx.amount ?? 0,
      promisedDate: ctx.payment_date ? new Date(ctx.payment_date) : new Date(),
      detectedByAI: true,
      notes: `Compromiso registrado vía flujo de voz. CallSid: ${call.callSid}`,
    })
    await Client.findByIdAndUpdate(call.clientId, { status: 'promised' })
  },

  'crm.schedule_reminder': async (ctx, call) => {
    if (!call.clientId || !ctx.payment_date) return
    const remindAt = new Date(ctx.payment_date)
    remindAt.setDate(remindAt.getDate() - 1)
    await Reminder.create({
      clientId: call.clientId,
      callId: call._id,
      channel: 'whatsapp',
      remindAt,
      message: `Recordatorio: tiene un pago comprometido de ${ctx.amount ?? ''} pesos para el ${ctx.payment_date}.`,
      status: 'pending',
    })
  },

  'whatsapp.send_payment_information': async (_ctx, call) => {
    if (!call.clientId) return
    const client = await Client.findById(call.clientId).lean()
    if (!client) return
    await prepareWhatsappMessage({
      phone: client.phone,
      template: 'cobranza_recordatorio',
      clientName: client.name,
      debt: client.debt,
      clientId: client._id,
      channel: 'voice-flow',
    })
  },

  'payments.verify_payment': async (_ctx, call) => {
    const result = await verifyPayment(call.clientId?.toString() ?? null)
    return {
      payment_exists: result.exists,
      ...(result.amount !== undefined ? { amount: result.amount } : {}),
      ...(result.date !== undefined ? { payment_date: result.date } : {}),
    }
  },

  'crm.close_case': async (_ctx, call) => {
    if (!call.clientId) return
    await Client.findByIdAndUpdate(call.clientId, { status: 'paid' })
  },

  'crm.create_clarification_ticket': async (_ctx, call) => {
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'deny_debt',
      status: 'open',
      notes: `Cliente no reconoció el adeudo durante la llamada. CallSid: ${call.callSid}`,
    })
  },

  'crm.mark_invoice_not_received': async (_ctx, call) => {
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'resend_invoice',
      status: 'open',
      notes: `Cliente indicó que no ha recibido su factura del mes durante la llamada. CallSid: ${call.callSid}`,
    })
  },

  // Negativa EXPLÍCITA de pago ("no voy a pagar", "me niego"), distinta de "no tengo
  // dinero ahora mismo" (que sigue buscando una fecha, ver punto 5 del guion de voz) —
  // ver tarjeta "Implementar Blacklist de Clientes Morosos en el Dashboard". Marca al
  // cliente como CANDIDATO (no lo mete directo a la Blacklist confirmada) para que un
  // administrador lo revise antes — ver blacklistController.ts.
  'crm.mark_payment_refusal': async (ctx, call) => {
    const reason = typeof ctx.motivo === 'string' && ctx.motivo.trim() ? ctx.motivo.trim() : 'Sin motivo especificado'
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'payment_refusal',
      status: 'open',
      notes: `Negativa de pago detectada durante la llamada: "${reason}". CallSid: ${call.callSid}`,
    })
    if (call.clientId) {
      await Client.findByIdAndUpdate(call.clientId, {
        blacklistStatus: 'candidate',
        blacklistReason: reason,
        blacklistMarkedAt: new Date(),
      })
    }
  },

  // A diferencia de los demás Ticket ("open" — necesitan que alguien actúe),
  // este se guarda cerrado: es solo un registro informativo, el pago ya está
  // resuelto vía cargo automático y no requiere seguimiento de un cobrador.
  'crm.mark_domiciliado': async (_ctx, call) => {
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'domiciliado',
      status: 'closed',
      notes: `Cliente reportó pago domiciliado/cargo automático durante la llamada. CallSid: ${call.callSid}`,
    })
    if (call.clientId) {
      await Client.findByIdAndUpdate(call.clientId, { lastIntent: 'domiciliado' })
      await excludeFromCollection(call.clientId, 'Pago domiciliado')
    }
  },

  // Cliente dice que YA pagó (marcar_saldo_pagado/mark_invoice_received) — se llama
  // DESPUÉS de payments.verify_payment, con el resultado de esa verificación en
  // ctx.paymentExists. Se excluye del ciclo automático de todos modos aunque el
  // proveedor no lo haya confirmado todavía (regla de negocio: "mantener los pagos
  // reportados... como pendientes de verificación, sin marcarlos automáticamente como
  // pagos confirmados" — no se toca `debt`/`status`, solo se pausa el hostigamiento
  // mientras alguien concilia). El Ticket SIEMPRE queda abierto (incluso si el proveedor
  // ya lo confirmó) porque "conciliación" sigue siendo una tarea interna real.
  'crm.mark_payment_reported': async (ctx, call) => {
    const confirmed = Boolean(ctx.paymentExists)
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'payment_reported',
      status: 'open',
      notes: `Cliente reportó haber pagado durante la llamada${confirmed ? ' (el proveedor de pagos lo confirmó)' : ' (pendiente de confirmar con el proveedor de pagos)'}. CallSid: ${call.callSid}`,
    })
    await excludeFromCollection(call.clientId, 'Pago reportado')
  },

  // Cliente dice que el pago YA está en trámite interno de SU empresa (tesorería,
  // cuentas por pagar, finanzas, IT, autorización, programación, revisión — ver tarjeta,
  // se agrupan en un solo escenario) — distinto de "ya pagué" (crm.mark_payment_reported)
  // y de una promesa a futuro (crm.create_payment_commitment).
  'crm.mark_payment_in_process': async (ctx, call) => {
    const area = typeof ctx.area === 'string' && ctx.area.trim() ? ctx.area.trim() : 'sin especificar'
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'payment_in_process',
      status: 'open',
      notes: `Cliente indicó que el pago está en trámite interno (${area}) durante la llamada. CallSid: ${call.callSid}`,
    })
    await excludeFromCollection(call.clientId, `Pago en proceso — ${area}`)
  },
}

export async function runAction(
  service: string,
  action: string,
  ctx: FlowContext,
  call: HydratedDocument<ICall>
): Promise<Partial<FlowContext> | void> {
  const key = `${service}.${action}`
  const handler = registry[key]
  if (!handler) {
    console.error(`[FlowEngine] No hay implementación registrada para api_call "${key}"`)
    return
  }
  return handler(ctx, call)
}
