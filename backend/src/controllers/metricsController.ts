import { Request, Response } from "express"
import Client from "../models/Client"
import Message from "../models/Message"
import Conversation from "../models/Conversation"
import Call from "../models/Call"
import { buildClientReportFilter } from "../utils/reportFilters"

// Semanas (lunes a domingo) que muestra la gráfica de promesas
const CHART_WEEKS = 8
const WEEK_MS = 7 * 24 * 3600_000

// Lunes 00:00 en hora de CDMX (UTC-6, sin horario de verano desde 2022) de la semana de esa fecha. El servidor
// corre en UTC, así que sin esto las llamadas del domingo por la noche caían en la semana siguiente.
function startOfWeek(d: Date): Date {
  const wall = new Date(d.getTime() - 6 * 3600_000)
  const daysSinceMonday = (wall.getUTCDay() + 6) % 7
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - daysSinceMonday, 6))
}

// Disposiciones de llamada que se refieren a un pago (Payment scheduled incluye las domiciliadas; Payment refused no
// cuenta). La tarjeta Payment promises, la gráfica Voice calls overview y el filtro con el que se abre Calls usan
// esta misma lista, para que los tres muestren el mismo número.
const PAYMENT_LIKE_DISPOSITIONS = ["Payment scheduled", "Payment in process", "Payment received"]

// Todo se calcula en el servidor con agregaciones sobre TODOS los clientes (sin límite de
// cantidad) y respeta los 5 filtros del dashboard (country, collectorId, team, teamLeader,
// collector). Con filtros, las promesas/llamadas/mensajes se limitan a los clientes que
// cumplen el filtro.
export async function getMetrics(req: Request, res: Response) {
  try {
    const clientFilter = buildClientReportFilter(req.query)
    const hasFilter = Object.keys(clientFilter).length > 0
    const ids = hasFilter ? await Client.find(clientFilter).distinct("_id") : null
    const byClient = ids ? { clientId: { $in: ids } } : {}

    const since = new Date(startOfWeek(new Date()).getTime() - WEEK_MS * (CHART_WEEKS - 1))

    const [
      totalClients,
      activeClients,
      debtAgg,
      recoveredAgg,
      respondedClients,
      riskAgg,
      messageStatusAgg,
      conversationStatusAgg,
      callStatusAgg,
      callsWithPromise,
      callsNoAnswer,
      promiseRows,
    ] = await Promise.all([
      Client.countDocuments(clientFilter),
      Client.countDocuments({ ...clientFilter, status: { $ne: "paid" } }),
      // Deuda activa: lo que ya se pagó no cuenta
      Client.aggregate([
        { $match: { ...clientFilter, status: { $ne: "paid" } } },
        { $group: { _id: null, total: { $sum: "$debt" } } },
      ]),
      Client.aggregate([
        { $match: { ...clientFilter, status: "paid" } },
        { $group: { _id: null, total: { $sum: "$debt" } } },
      ]),
      // Respondió = ya hubo conversación real (por llamada o WhatsApp), no solo "se le marcó"
      Client.countDocuments({
        ...clientFilter,
        $or: [{ totalReplies: { $gt: 0 } }, { status: { $in: ["contacted", "negotiating", "promised", "paid"] } }],
      }),
      Client.aggregate([{ $match: clientFilter }, { $group: { _id: "$risk", count: { $sum: 1 } } }]),
      Message.aggregate([{ $match: byClient }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Conversation.aggregate([{ $match: byClient }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Call.aggregate([{ $match: byClient }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Call.countDocuments({ ...byClient, disposition: { $in: PAYMENT_LIKE_DISPOSITIONS } }),
      Call.countDocuments({
        ...byClient,
        $or: [{ status: "failed" }, { disposition: { $in: ["No answer", "Voice mail"] } }],
      }),
      // Gráfica semanal: las mismas llamadas que cuenta la tarjeta, de las últimas semanas
      Call.find({ ...byClient, disposition: { $in: PAYMENT_LIKE_DISPOSITIONS }, createdAt: { $gte: since } }, "createdAt").lean(),
    ])

    const totalDebt = debtAgg[0]?.total || 0
    const recoveredDebt = recoveredAgg[0]?.total || 0
    const responseRate = totalClients > 0 ? Math.round((respondedClients / totalClients) * 100) : 0

    const riskBreakdown: Record<string, number> = { low: 0, medium: 0, high: 0 }
    riskAgg.forEach((r: any) => {
      if (r._id) riskBreakdown[r._id] = r.count
    })

    const msgStats: Record<string, number> = {
      prepared: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0,
    }
    let totalMessages = 0
    messageStatusAgg.forEach((m: any) => {
      if (m._id) {
        msgStats[m._id] = m.count
        totalMessages += m.count
      }
    })

    const convStats: Record<string, number> = {
      active: 0, awaiting_client: 0, awaiting_agent: 0, closed: 0,
    }
    conversationStatusAgg.forEach((c: any) => {
      if (c._id) convStats[c._id] = c.count
    })

    const callStats: Record<string, number> = { in_progress: 0, completed: 0, failed: 0, requires_human: 0 }
    let totalCalls = 0
    callStatusAgg.forEach((c: any) => {
      if (c._id) { callStats[c._id] = c.count; totalCalls += c.count }
    })

    // Serie semanal completa (las semanas sin llamadas salen en 0 para que la gráfica no se salte)
    // Se agrupa en JS (en vez de $dateTrunc) para no exigir MongoDB 5.0+
    const weekly = new Map<number, number>()
    promiseRows.forEach((call: any) => {
      const key = startOfWeek(new Date(call.createdAt)).getTime()
      weekly.set(key, (weekly.get(key) ?? 0) + 1)
    })
    const promiseWeekly = Array.from({ length: CHART_WEEKS }, (_, i) => {
      const weekStart = new Date(since.getTime() + WEEK_MS * i)
      return { weekStart: weekStart.toISOString(), count: weekly.get(weekStart.getTime()) ?? 0 }
    })

    res.json({
      totalClients,
      activeClients,
      totalDebt,
      recoveredDebt,
      // Tarjeta Payment promises: histórico, el mismo número que la gráfica Voice calls overview (callStats.withPromise)
      paymentPromises: callsWithPromise,
      paymentDispositions: PAYMENT_LIKE_DISPOSITIONS,
      responseRate,
      riskBreakdown,
      messageStats: { ...msgStats, total: totalMessages },
      conversationStats: convStats,
      callStats: { ...callStats, total: totalCalls, withPromise: callsWithPromise, noAnswer: callsNoAnswer },
      promiseWeekly,
    })
  } catch (error) {
    console.log("Error getMetrics:", error)
    res.status(500).json({ message: "Error calculando métricas" })
  }
}
