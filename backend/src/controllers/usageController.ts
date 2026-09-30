import { Request, Response } from 'express'
import Call from '../models/Call'
import Message from '../models/Message'
import {
  estimateOpenAICostUsd,
  estimateClaudeCostUsd,
  estimateTwilioCostUsd,
  estimateWhatsappCostUsd,
  estimateDeepgramCostUsd,
  estimateElevenLabsCostUsd,
} from '../config/pricing'

// Motor de cada llamada + caracteres que habló el agente (lo que cobra ElevenLabs).
// Call.voiceEngine existe solo en llamadas nuevas; para las anteriores se deduce: el motor
// ElevenLabs no consume tokens de OpenAI y sí muchos de Claude (el de OpenAI solo usa
// ~700 de Claude, del resumen post-llamada). Los caracteres son los del texto guardado —
// la voz lee las cifras con letra (utils/spokenNumbers.ts), así que lo facturado es un
// poco más.
const ENGINE_FIELDS = {
  $addFields: {
    isPipeline: {
      $cond: [
        { $ne: [{ $ifNull: ['$voiceEngine', null] }, null] },
        { $eq: ['$voiceEngine', 'elevenlabs'] },
        {
          $and: [
            { $eq: [{ $ifNull: ['$openaiUsage.totalTokens', 0] }, 0] },
            { $gt: [{ $ifNull: ['$claudeUsage.inputTokens', 0] }, 3000] },
          ],
        },
      ],
    },
    agentChars: {
      $reduce: {
        input: { $filter: { input: { $ifNull: ['$transcript', []] }, cond: { $eq: ['$$this.role', 'assistant'] } } },
        initialValue: 0,
        in: { $add: ['$$value', { $strLenCP: { $ifNull: ['$$this.content', ''] } }] },
      },
    },
  },
}

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
        ENGINE_FIELDS,
        {
          $group: {
            _id: null,
            openaiCalls: { $sum: { $cond: ['$isPipeline', 0, 1] } },
            pipelineCalls: { $sum: { $cond: ['$isPipeline', 1, 0] } },
            pipelineDurationSeconds: { $sum: { $cond: ['$isPipeline', { $ifNull: ['$durationSeconds', 0] }, 0] } },
            elevenlabsChars: { $sum: { $cond: ['$isPipeline', '$agentChars', 0] } },
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
        ENGINE_FIELDS,
        {
          $group: {
            // Día en hora de CDMX (no UTC): una llamada de las 7pm no debe caer en el día siguiente
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'America/Mexico_City' } },
            calls: { $sum: 1 },
            pipelineDurationSeconds: { $sum: { $cond: ['$isPipeline', { $ifNull: ['$durationSeconds', 0] }, 0] } },
            elevenlabsChars: { $sum: { $cond: ['$isPipeline', '$agentChars', 0] } },
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
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'America/Mexico_City' } },
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
      openaiCalls: 0, pipelineCalls: 0, pipelineDurationSeconds: 0, elevenlabsChars: 0,
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
    const deepgramCostUsd = estimateDeepgramCostUsd(c.pipelineDurationSeconds)
    const elevenlabsCostUsd = estimateElevenLabsCostUsd(c.elevenlabsChars)

    // timeseries: merge de las dos agregaciones diarias por fecha
    const byDate = new Map<string, any>()
    callDaily.forEach((d: any) => {
      byDate.set(d._id, {
        date: d._id,
        calls: d.calls,
        openaiCostUsd: estimateOpenAICostUsd(d),
        claudeCostUsd: estimateClaudeCostUsd({ inputTokens: d.claudeInputTokens, outputTokens: d.claudeOutputTokens }),
        twilioCostUsd: estimateTwilioCostUsd(d.durationSeconds),
        deepgramCostUsd: estimateDeepgramCostUsd(d.pipelineDurationSeconds),
        elevenlabsCostUsd: estimateElevenLabsCostUsd(d.elevenlabsChars),
        whatsappCostUsd: 0,
      })
    })
    msgDaily.forEach((d: any) => {
      const entry = byDate.get(d._id) ?? {
        date: d._id, calls: 0, openaiCostUsd: 0, claudeCostUsd: 0, twilioCostUsd: 0, deepgramCostUsd: 0, elevenlabsCostUsd: 0, whatsappCostUsd: 0,
      }
      entry.whatsappCostUsd = estimateWhatsappCostUsd(d.outbound)
      byDate.set(d._id, entry)
    })

    const timeseries = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        totalCostUsd: d.openaiCostUsd + d.claudeCostUsd + d.twilioCostUsd + d.deepgramCostUsd + d.elevenlabsCostUsd + d.whatsappCostUsd,
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
        // Llamadas por motor de voz y lo que solo consume el motor ElevenLabs
        byEngine: { openai: c.openaiCalls, elevenlabs: c.pipelineCalls },
        deepgram: { minutes: Math.round((c.pipelineDurationSeconds / 60) * 10) / 10, costUsd: deepgramCostUsd },
        elevenlabs: { characters: c.elevenlabsChars, costUsd: elevenlabsCostUsd },
      },
      whatsapp: {
        outboundCount,
        inboundCount,
        costUsd: whatsappCostUsd,
      },
      totalCostUsd: openaiCostUsd + claudeCostUsd + twilioCostUsd + deepgramCostUsd + elevenlabsCostUsd + whatsappCostUsd,
      timeseries,
    })
  } catch (error) {
    console.error('Error getUsage:', error)
    res.status(500).json({ message: 'Error calculando el consumo de recursos' })
  }
}
