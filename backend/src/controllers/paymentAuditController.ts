// Endpoints de la revisión de pagos mal clasificados (botón "Review payments" de Calls), ver paymentAudit.service.ts
import { Request, Response } from 'express'
import mongoose from 'mongoose'
import Call from '../models/Call'
import Client from '../models/Client'
import PaymentPromise from '../models/PaymentPromise'
import { analyzePaymentCommitment, mentionsPayment } from '../services/paymentAudit.service'
import { excludeForPayment, paymentExclusionReason, PAYMENT_DISPOSITIONS } from '../services/paymentExclusion.service'
import { STATUS_OPTIONS, DispositionStatus, nextActionFor } from '../config/disposition'
import { splitFilterValues } from '../utils/reportFilters'

// Llamadas por petición de análisis: la pantalla pide tandas pequeñas para mostrar avance y no exceder tiempos
const MAX_PER_REQUEST = 5
const MAX_PREVIEW = 2000

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

// Cuántas llamadas cumplen el filtro y cuáles se van a analizar. No usa Claude (no cuesta nada).
export async function previewPaymentAudit(req: Request, res: Response): Promise<void> {
  try {
    const { dispositions, from, to, includeReviewed } = req.body as { dispositions?: string; from?: string; to?: string; includeReviewed?: boolean }
    // Las que ya están clasificadas como pago no se revisan
    const selected = splitFilterValues(dispositions).filter((d) => (STATUS_OPTIONS as readonly string[]).includes(d) && !PAYMENT_DISPOSITIONS.includes(d))
    if (selected.length === 0) {
      res.status(400).json({ message: 'Elige al menos una disposición que no sea de pago' })
      return
    }
    const filter: Record<string, any> = { disposition: { $in: selected } }
    if (isDay(String(from ?? '')) || isDay(String(to ?? ''))) {
      filter.createdAt = {
        ...(isDay(String(from ?? '')) ? { $gte: new Date(`${from}T00:00:00-06:00`) } : {}),
        ...(isDay(String(to ?? '')) ? { $lte: new Date(`${to}T23:59:59.999-06:00`) } : {}),
      }
    }

    const calls = await Call.find(filter).select('transcript paymentAudit').sort({ createdAt: -1 }).limit(MAX_PREVIEW + 1).lean()
    const truncated = calls.length > MAX_PREVIEW
    const rows = calls.slice(0, MAX_PREVIEW)
    // Las confirmadas o descartadas por una persona nunca se vuelven a analizar
    const decided = (c: any) => ['confirmed', 'dismissed'].includes(c.paymentAudit?.status)
    const withPayment = rows.filter((c) => !decided(c) && mentionsPayment(c.transcript as any))
    const toAnalyze = withPayment.filter((c) => includeReviewed || !c.paymentAudit)

    res.json({
      matching: rows.length,
      withPayment: withPayment.length,
      alreadyReviewed: withPayment.length - toAnalyze.length,
      callIds: toAnalyze.map((c) => String(c._id)),
      truncated,
    })
  } catch (error) {
    console.error('[PaymentAudit] preview:', error)
    res.status(500).json({ message: 'Error buscando las llamadas' })
  }
}

export async function analyzePaymentAudit(req: Request, res: Response): Promise<void> {
  const ids = Array.isArray(req.body?.callIds) ? (req.body.callIds as string[]).filter((id) => mongoose.isValidObjectId(id)) : []
  if (ids.length === 0 || ids.length > MAX_PER_REQUEST) {
    res.status(400).json({ message: `Se analizan de 1 a ${MAX_PER_REQUEST} llamadas por petición` })
    return
  }
  let analyzed = 0
  let found = 0
  let failed = 0
  try {
    const calls = await Call.find({ _id: { $in: ids } })
    for (const call of calls) {
      if (['confirmed', 'dismissed'].includes(call.paymentAudit?.status ?? '')) continue
      const client = call.clientId ? await Client.findById(call.clientId).select('debt').lean() : null
      try {
        const { finding, usage } = await analyzePaymentCommitment(call.transcript, call.createdAt as Date, (client?.debt as number) ?? null)
        await Call.updateOne(
          { _id: call._id },
          {
            paymentAudit: finding ? { status: 'pending', reviewedAt: new Date(), ...finding } : { status: 'none', reviewedAt: new Date() },
            $inc: { 'claudeUsage.inputTokens': usage.inputTokens, 'claudeUsage.outputTokens': usage.outputTokens },
          }
        )
        analyzed++
        if (finding) found++
      } catch (err: any) {
        // Sin saldo o con la clave mal no tiene caso seguir
        if (/credit balance|authentication|api[- ]key/i.test(String(err?.message))) throw err
        failed++
        console.error(`[PaymentAudit] No se pudo analizar la llamada ${call._id}:`, err?.message ?? err)
      }
    }
    res.json({ analyzed, found, failed })
  } catch (error: any) {
    console.error('[PaymentAudit] analyze:', error?.message ?? error)
    const noCredit = /credit balance/i.test(String(error?.message))
    res.status(503).json({ message: noCredit ? 'Anthropic sin saldo: recarga créditos y vuelve a intentar' : 'No se pudo conectar con Claude para analizar' })
  }
}

// Hallazgos por verificar, los más recientes primero
export async function getPaymentAuditFindings(_req: Request, res: Response): Promise<void> {
  try {
    const [calls, total] = await Promise.all([
      Call.find({ 'paymentAudit.status': 'pending' }).populate('clientId', 'name phone debt').sort({ createdAt: -1 }).limit(100).lean(),
      Call.countDocuments({ 'paymentAudit.status': 'pending' }),
    ])
    res.json({ findings: calls, total })
  } catch (error) {
    console.error('[PaymentAudit] findings:', error)
    res.status(500).json({ message: 'Error obteniendo los hallazgos' })
  }
}

// La persona confirma el hallazgo (puede corregir fecha y monto): la llamada cambia de disposición, se registra la
// promesa y, si la llamada es de este mes, el cliente sale de las rondas. No crea recordatorios de WhatsApp.
export async function confirmPaymentAudit(req: Request, res: Response): Promise<void> {
  try {
    const call = mongoose.isValidObjectId(req.params.id) ? await Call.findById(req.params.id) : null
    const audit = call?.paymentAudit
    if (!call || audit?.status !== 'pending' || !audit.type) {
      res.status(404).json({ message: 'Ese hallazgo ya no está pendiente' })
      return
    }
    const disposition = audit.type as DispositionStatus
    const date = isDay(String(req.body?.date ?? '')) ? String(req.body.date) : audit.date ?? null
    const bodyAmount = Number(req.body?.amount)
    const client = call.clientId ? await Client.findById(call.clientId).select('debt').lean() : null
    const amount = bodyAmount > 0 ? bodyAmount : audit.amount ?? (client?.debt as number) ?? 0
    if (disposition === 'Payment scheduled' && !date) {
      res.status(400).json({ message: 'La promesa necesita una fecha' })
      return
    }
    const promiseDate = date ? new Date(`${date}T12:00:00-06:00`) : undefined

    // Se reclama el hallazgo antes de escribir, para que un doble clic no registre dos promesas
    const claimed = await Call.findOneAndUpdate(
      { _id: call._id, 'paymentAudit.status': 'pending' },
      {
        'paymentAudit.status': 'confirmed',
        'paymentAudit.date': date,
        originalDisposition: call.originalDisposition ?? call.disposition,
        disposition,
        nextAction: nextActionFor(disposition),
        ...(disposition === 'Payment scheduled' ? { promiseDate, amount } : {}),
      }
    )
    if (!claimed) {
      res.status(404).json({ message: 'Ese hallazgo ya no está pendiente' })
      return
    }

    if (call.clientId) {
      if (disposition === 'Payment scheduled') {
        await PaymentPromise.create({
          clientId: call.clientId,
          amount,
          promisedDate: promiseDate,
          detectedByAI: true,
          notes: `Promesa confirmada en la revisión de llamadas. CallSid: ${call.callSid}`,
        })
        await Client.findByIdAndUpdate(call.clientId, { paymentPromiseAmount: amount, datePromise: promiseDate })
      }
      // El estado del cliente solo cambia si esta era su llamada más reciente
      const newer = await Call.exists({ clientId: call.clientId, createdAt: { $gt: call.createdAt } })
      if (!newer) {
        await Client.findByIdAndUpdate(call.clientId, {
          lastCallDisposition: disposition,
          nextAction: nextActionFor(disposition),
          ...(disposition === 'Payment scheduled' ? { status: 'promised' } : disposition === 'Payment in process' ? { status: 'negotiating' } : {}),
        })
      }
      // Las facturas son mensuales: solo un pago de este mes saca al cliente de las rondas
      const month = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }).slice(0, 7)
      if (month(call.createdAt as Date) === month(new Date())) {
        await excludeForPayment(call.clientId, paymentExclusionReason(disposition)!)
        await Client.findByIdAndUpdate(call.clientId, { followUp: null, scheduledCallbackAt: null, scheduledCallbackReason: null })
      }
    }
    res.json({ ok: true, disposition })
  } catch (error) {
    console.error('[PaymentAudit] confirm:', error)
    res.status(500).json({ message: 'Error al confirmar el hallazgo' })
  }
}

export async function dismissPaymentAudit(req: Request, res: Response): Promise<void> {
  try {
    const call = mongoose.isValidObjectId(req.params.id)
      ? await Call.findOneAndUpdate({ _id: req.params.id, 'paymentAudit.status': 'pending' }, { 'paymentAudit.status': 'dismissed' })
      : null
    if (!call) {
      res.status(404).json({ message: 'Ese hallazgo ya no está pendiente' })
      return
    }
    res.json({ ok: true })
  } catch (error) {
    console.error('[PaymentAudit] dismiss:', error)
    res.status(500).json({ message: 'Error al descartar el hallazgo' })
  }
}
