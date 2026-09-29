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
import { normalizeMexicanPhone } from '../utils/phone'

// "YYYY-MM-DD" + "HH:MM" en hora del centro de México (UTC-6, sin horario de verano desde
// 2022) → instante UTC. Sin hora, se agenda a las 10:00. null si la fecha no es válida.
function mexicoCityDateTimeToUtc(fecha: string, hora?: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim())
  if (!d) return null
  const t = /^(\d{1,2}):(\d{2})$/.exec((hora ?? '').trim())
  const hours = t ? Math.min(23, Number(t[1])) : 10
  const minutes = t ? Math.min(59, Number(t[2])) : 0
  const result = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hours + 6, minutes))
  return Number.isNaN(result.getTime()) ? null : result
}

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

const DOCUMENT_LABEL: Record<string, string> = {
  factura: 'Factura',
  contrato: 'Contrato',
  estado_de_cuenta: 'Estado de cuenta',
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

  // Sin `tipo` (o tipo "adeudo") se comporta exactamente como siempre (deny_debt). "monto"
  // y "factura" usan los mismos reasons que el flujo de WhatsApp (dispute_amount /
  // dispute_invoice) — diagrama preventivo: "El monto no es correcto" / "La factura está
  // incorrecta".
  'crm.create_clarification_ticket': async (ctx, call) => {
    // servicio / contrato / otro: disputas del diagrama 1–30 días (paso 3E)
    const KNOWN = ['monto', 'factura', 'servicio', 'contrato', 'otro']
    const tipo: string = KNOWN.includes(ctx.tipo) ? ctx.tipo : 'adeudo'
    const detalle = typeof ctx.detalle === 'string' && ctx.detalle.trim() ? ` Detalle: ${ctx.detalle.trim()}.` : ''
    const montoCliente =
      typeof ctx.monto_cliente === 'number' ? ` Monto que el cliente tiene registrado: ${ctx.monto_cliente.toLocaleString('es-MX')} pesos.` : ''
    const BASE_BY_TIPO: Record<string, string> = {
      monto: 'Cliente reconoce el adeudo pero indicó que el monto no es correcto durante la llamada.',
      factura: 'Cliente indicó que la factura está incorrecta durante la llamada.',
      servicio: 'Cliente reportó un problema con el servicio durante la llamada.',
      contrato: 'Cliente reportó un problema con el contrato durante la llamada.',
      otro: 'Cliente reportó un problema durante la llamada.',
      adeudo: 'Cliente no reconoció el adeudo durante la llamada.',
    }
    const REASON_BY_TIPO: Record<string, string> = {
      monto: 'dispute_amount',
      factura: 'dispute_invoice',
      servicio: 'dispute_service',
      contrato: 'dispute_contract',
      otro: 'dispute_other',
      adeudo: 'deny_debt',
    }
    const base = BASE_BY_TIPO[tipo]
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: REASON_BY_TIPO[tipo],
      status: 'open',
      notes: `${base}${montoCliente}${detalle} CallSid: ${call.callSid}`,
    })
  },

  // "Háblame después" / "Déjame revisarlo" (diagrama preventivo) — agenda la llamada que
  // pidió el cliente; la dispara dispatchScheduledCallbacks en autoCallScheduler.service.ts.
  'crm.schedule_callback': async (ctx, call) => {
    const at = typeof ctx.fecha === 'string' ? mexicoCityDateTimeToUtc(ctx.fecha, ctx.hora) : null
    const motivo = typeof ctx.motivo === 'string' && ctx.motivo.trim() ? ctx.motivo.trim() : 'El cliente pidió que se le llame después'
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'callback_requested',
      status: 'open',
      notes: `Cliente pidió que se le vuelva a llamar${at ? ` el ${ctx.fecha}${ctx.hora ? ` a las ${ctx.hora}` : ''}` : ` (fecha no válida: "${ctx.fecha}")`}. Motivo: ${motivo}. CallSid: ${call.callSid}`,
    })
    if (call.clientId && at) {
      await Client.findByIdAndUpdate(call.clientId, { scheduledCallbackAt: at, scheduledCallbackReason: motivo })
    }
  },

  // "Lo ve otra persona" (diagrama preventivo) — la persona responsable pasa a ser el
  // contacto del cliente (el saludo de la siguiente llamada se dirige a ella); el
  // contacto anterior queda en las notas del Ticket. El teléfono, si lo dio, se agrega a
  // alternatePhones — el principal no se toca.
  'crm.update_contact': async (ctx, call) => {
    const nombre = typeof ctx.nombre === 'string' ? ctx.nombre.trim() : ''
    if (!nombre) return
    const telefono = typeof ctx.telefono === 'string' && ctx.telefono.replace(/\D/g, '').length >= 10
      ? normalizeMexicanPhone(ctx.telefono)
      : null
    const puesto = typeof ctx.puesto === 'string' && ctx.puesto.trim() ? ctx.puesto.trim() : null
    const before = call.clientId ? await Client.findById(call.clientId).select('contact').lean() : null
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'contact_update',
      status: 'closed',
      notes: `Nuevo contacto responsable: ${nombre}${puesto ? ` (${puesto})` : ''}${telefono ? `, tel. ${telefono}` : ''}. Contacto anterior: ${before?.contact ?? 'sin contacto'}. CallSid: ${call.callSid}`,
    })
    if (call.clientId) {
      await Client.findByIdAndUpdate(call.clientId, {
        contact: nombre,
        ...(telefono ? { $addToSet: { alternatePhones: telefono } } : {}),
      })
    }
  },

  // El cliente no tiene / pide factura, contrato o estado de cuenta — ver tarjeta
  // "Implementar Needs Admin Label". Crea el Ticket y marca al cliente como Needs Admin
  // (independiente de requiresHuman) hasta que un administrador lo marque como enviado.
  'crm.request_documents': async (ctx, call) => {
    const documents = (Array.isArray(ctx.documentos) ? ctx.documentos : [])
      .filter((d: unknown): d is string => typeof d === 'string' && d in DOCUMENT_LABEL)
    if (documents.length === 0) documents.push('factura')
    // Lo que el agente indagó (qué facturas, a dónde enviarlas) — va en las notas y en el
    // cliente para que quien envíe no tenga que volver a llamar a preguntarlo.
    const details = [
      ctx.facturas ? `Facturas: ${ctx.facturas}` : null,
      ctx.medio ? `Enviar a: ${ctx.medio}` : null,
      ctx.detalle ? `Detalle: ${ctx.detalle}` : null,
    ].filter(Boolean) as string[]
    const labels = documents.map((d: string) => DOCUMENT_LABEL[d]).join(', ')
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      // Solo factura conserva el reason de siempre (reportes/filtros existentes)
      reason: documents.length === 1 && documents[0] === 'factura' ? 'resend_invoice' : 'document_request',
      status: 'open',
      notes: `Cliente solicitó durante la llamada: ${labels}.${details.length ? ` ${details.join('. ')}.` : ''} CallSid: ${call.callSid}`,
    })
    if (call.clientId) {
      // $addToSet: si ya tenía una solicitud pendiente, se suman los documentos nuevos
      await Client.findByIdAndUpdate(call.clientId, {
        needsAdmin: true,
        needsAdminDetail: details.length ? details.join('. ') : null,
        needsAdminAt: new Date(),
        $addToSet: { needsAdminDocuments: { $each: documents } },
      })
    }
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
      // Si en esta misma llamada se marcó "pago en proceso" (ej. el agente lo sugirió y
      // luego el cliente lo desmintió), esa exclusión contradice la negativa — se quita
      // para que la tabla no muestre "Pago en proceso" en un cliente que no va a pagar.
      const contradictsExclusion = (call.calledFunctions ?? []).includes('marcar_pago_en_proceso')
      await Client.findByIdAndUpdate(call.clientId, {
        blacklistStatus: 'candidate',
        blacklistReason: reason,
        blacklistMarkedAt: new Date(),
        ...(contradictsExclusion
          ? { collectionExcludedUntil: null, collectionExclusionReason: null, collectionExcludedAt: null }
          : {}),
      })
    }
  },

  // A diferencia de los demás Ticket ("open" — necesitan que alguien actúe),
  // este se guarda cerrado: es solo un registro informativo, el pago ya está
  // resuelto vía cargo automático y no requiere seguimiento de un cobrador.
  'crm.mark_domiciliado': async (ctx, call) => {
    const fecha = typeof ctx.fecha === 'string' && ctx.fecha.trim() ? ctx.fecha.trim() : null
    await Ticket.create({
      clientId: call.clientId ?? null,
      callId: call._id,
      phone: call.phone,
      reason: 'domiciliado',
      status: 'closed',
      notes: `Cliente reportó pago domiciliado/cargo automático durante la llamada${fecha ? ` para el ${fecha}` : ''}. CallSid: ${call.callSid}`,
    })
    if (call.clientId) {
      await Client.findByIdAndUpdate(call.clientId, { lastIntent: 'domiciliado' })
      await excludeFromCollection(call.clientId, 'Pago domiciliado')
      // El cargo domiciliado SÍ es un compromiso de pago con fecha (corrección #4 del
      // diagrama "Llamada preventiva al corriente") — se registra igual que una promesa
      // manual, con el saldo actual del cliente como monto. Reutiliza los mismos handlers
      // que registrar_promesa_pago en vez de duplicar la lógica de PaymentPromise/Reminder.
      if (fecha) {
        const client = await Client.findById(call.clientId).select('debt').lean()
        const promiseCtx = { amount: client?.debt ?? 0, payment_date: fecha }
        await registry['crm.create_payment_commitment'](promiseCtx, call)
        await registry['crm.schedule_reminder'](promiseCtx, call)
      }
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
      notes: `Cliente reportó haber pagado durante la llamada${confirmed ? ' (el proveedor de pagos lo confirmó)' : ' (pendiente de confirmar con el proveedor de pagos)'}.${typeof ctx.fechaPago === 'string' && ctx.fechaPago.trim() ? ` Fecha aproximada del pago según el cliente: ${ctx.fechaPago.trim()}.` : ''}${typeof ctx.montoPagado === 'number' ? ` Monto que dice haber pagado: ${ctx.montoPagado.toLocaleString('es-MX')} pesos.` : ''}${typeof ctx.medioPago === 'string' && ctx.medioPago.trim() ? ` Medio de pago: ${ctx.medioPago.trim()}.` : ''} CallSid: ${call.callSid}`,
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
      notes: `Cliente indicó que el pago está en trámite interno (${area}) durante la llamada.${typeof ctx.fecha_estimada === 'string' && ctx.fecha_estimada.trim() ? ` Fecha estimada de pago según el cliente: ${ctx.fecha_estimada.trim()} (no confirmada).` : ''} CallSid: ${call.callSid}`,
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
