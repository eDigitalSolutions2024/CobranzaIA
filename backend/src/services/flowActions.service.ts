import { HydratedDocument } from 'mongoose'
import Client from '../models/Client'
import PaymentPromise from '../models/PaymentPromise'
import Reminder from '../models/Reminder'
import Ticket from '../models/Ticket'
import { ICall } from '../models/Call'
import { prepareWhatsappMessage } from './whatsappService'
import { verifyPayment } from './paymentsProvider.service'
import { FlowContext } from '../types/flow'

type ActionFn = (ctx: FlowContext, call: HydratedDocument<ICall>) => Promise<Partial<FlowContext> | void>

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
