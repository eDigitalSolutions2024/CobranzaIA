import { Request, Response } from 'express'
import Call from '../models/Call'
import Message from '../models/Message'
import {
  estimateOpenAICostUsd,
  estimateClaudeCostUsd,
  estimateTwilioCostUsd,
  estimateWhatsappCostUsd,
} from '../config/pricing'

// Panel de "Recursos" — cuánto se está consumiendo de cada proveedor (OpenAI Realtime,
// Claude Haiku, Twilio, Meta WhatsApp) y un estimado de costo en USD. Los costos son
// aproximados (ver config/pricing.ts) — esto es para tener visibilidad de tendencia y
// volumen, no para conciliar contra facturas reales.
export async function getUsage(req: Request, res: Response) {
  try {
    const daysParam = req.query.days as string | undefined
    const isToday = daysParam === 'today'
    const days = daysParam === 'all' || isToday ? null : Number(daysParam) || 30

    const from = isToday
      ? new Date(new Date().setHours(0, 0, 0, 0))
      : days
        ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        : null
    const dateMatch = from ? { createdAt: { $gte: from } } : {}

    const [callAgg, msgAgg, callDaily, msgDaily] = await Promise.all([
      Call.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            requiresHuman: { $sum: { $cond: [{ $eq: ['$status', 'requires_human'] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            totalDurationSeconds: { $sum: { $ifNull: ['$durationSeconds', 0] } },
            totalTokens: { $sum: '$openaiUsage.totalTokens' },
            inputTextTokens: { $sum: '$openaiUsage.inputTextTokens' },
            inputAudioTokens: { $sum: '$openaiUsage.inputAudioTokens' },
            outputTextTokens: { $sum: '$openaiUsage.outputTextTokens' },
            outputAudioTokens: { $sum: '$openaiUsage.outputAudioTokens' },
            claudeInputTokens: { $sum: '$claudeUsage.inputTokens' },
            claudeOutputTokens: { $sum: '$claudeUsage.outputTokens' },
          },
        },
      ]),
      Message.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: '$direction',
            count: { $sum: 1 },
          },
        },
      ]),
      Call.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            calls: { $sum: 1 },
            durationSeconds: { $sum: { $ifNull: ['$durationSeconds', 0] } },
            inputTextTokens: { $sum: '$openaiUsage.inputTextTokens' },
            inputAudioTokens: { $sum: '$openaiUsage.inputAudioTokens' },
            outputTextTokens: { $sum: '$openaiUsage.outputTextTokens' },
            outputAudioTokens: { $sum: '$openaiUsage.outputAudioTokens' },
            claudeInputTokens: { $sum: '$claudeUsage.inputTokens' },
            claudeOutputTokens: { $sum: '$claudeUsage.outputTokens' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { ...dateMatch, direction: 'outbound' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            outbound: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ])

    const c = callAgg[0] ?? {
      total: 0, completed: 0, failed: 0, requiresHuman: 0, inProgress: 0, totalDurationSeconds: 0,
      totalTokens: 0, inputTextTokens: 0, inputAudioTokens: 0, outputTextTokens: 0, outputAudioTokens: 0,
      claudeInputTokens: 0, claudeOutputTokens: 0,
    }

    let outboundCount = 0
    let inboundCount = 0
    msgAgg.forEach((m: any) => {
      if (m._id === 'outbound') outboundCount = m.count
      else if (m._id === 'inbound') inboundCount = m.count
    })

    const openaiCostUsd = estimateOpenAICostUsd(c)
    const claudeCostUsd = estimateClaudeCostUsd({ inputTokens: c.claudeInputTokens, outputTokens: c.claudeOutputTokens })
    const twilioCostUsd = estimateTwilioCostUsd(c.totalDurationSeconds)
    const whatsappCostUsd = estimateWhatsappCostUsd(outboundCount)

    // timeseries: merge de las dos agregaciones diarias por fecha
    const byDate = new Map<string, any>()
    callDaily.forEach((d: any) => {
      byDate.set(d._id, {
        date: d._id,
        calls: d.calls,
        openaiCostUsd: estimateOpenAICostUsd(d),
        claudeCostUsd: estimateClaudeCostUsd({ inputTokens: d.claudeInputTokens, outputTokens: d.claudeOutputTokens }),
        twilioCostUsd: estimateTwilioCostUsd(d.durationSeconds),
        whatsappCostUsd: 0,
      })
    })
    msgDaily.forEach((d: any) => {
      const entry = byDate.get(d._id) ?? {
        date: d._id, calls: 0, openaiCostUsd: 0, claudeCostUsd: 0, twilioCostUsd: 0, whatsappCostUsd: 0,
      }
      entry.whatsappCostUsd = estimateWhatsappCostUsd(d.outbound)
      byDate.set(d._id, entry)
    })

    const timeseries = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        totalCostUsd: d.openaiCostUsd + d.claudeCostUsd + d.twilioCostUsd + d.whatsappCostUsd,
      }))

    res.json({
      range: { days, from },
      calls: {
        total: c.total,
        completed: c.completed,
        failed: c.failed,
        requiresHuman: c.requiresHuman,
        inProgress: c.inProgress,
        totalDurationSeconds: c.totalDurationSeconds,
        avgDurationSeconds: c.total > 0 ? Math.round(c.totalDurationSeconds / c.total) : 0,
        twilioCostUsd,
        openai: {
          totalTokens: c.totalTokens,
          inputTextTokens: c.inputTextTokens,
          inputAudioTokens: c.inputAudioTokens,
          outputTextTokens: c.outputTextTokens,
          outputAudioTokens: c.outputAudioTokens,
          costUsd: openaiCostUsd,
        },
        claude: {
          inputTokens: c.claudeInputTokens,
          outputTokens: c.claudeOutputTokens,
          costUsd: claudeCostUsd,
        },
      },
      whatsapp: {
        outboundCount,
        inboundCount,
        costUsd: whatsappCostUsd,
      },
      totalCostUsd: openaiCostUsd + claudeCostUsd + twilioCostUsd + whatsappCostUsd,
      timeseries,
    })
  } catch (error) {
    console.error('Error getUsage:', error)
    res.status(500).json({ message: 'Error calculando el consumo de recursos' })
  }
}
