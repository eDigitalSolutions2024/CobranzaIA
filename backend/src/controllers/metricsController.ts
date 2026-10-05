import { Request, Response } from "express"
import Client from "../models/Client"
import Message from "../models/Message"
import PaymentPromise from "../models/PaymentPromise"
import Conversation from "../models/Conversation"
import Call from "../models/Call"
import { buildClientReportFilter } from "../utils/reportFilters"

// Semanas (lunes a domingo) que muestra la gráfica de promesas
const CHART_WEEKS = 8

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7))
  return out
}

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

    const since = startOfWeek(new Date())
    since.setDate(since.getDate() - 7 * (CHART_WEEKS - 1))

    const [
      totalClients,
      activeClients,
      debtAgg,
      recoveredAgg,
      paymentPromises,
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
      PaymentPromise.countDocuments({ status: "pending", ...byClient }),
      // Respondió = ya hubo conversación real (por llamada o WhatsApp), no solo "se le marcó"
      Client.countDocuments({
        ...clientFilter,
        $or: [{ totalReplies: { $gt: 0 } }, { status: { $in: ["contacted", "negotiating", "promised", "paid"] } }],
      }),
      Client.aggregate([{ $match: clientFilter }, { $group: { _id: "$risk", count: { $sum: 1 } } }]),
      Message.aggregate([{ $match: byClient }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Conversation.aggregate([{ $match: byClient }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Call.aggregate([{ $match: byClient }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Call.countDocuments({ ...byClient, promiseDate: { $ne: null } }),
      Call.countDocuments({
        ...byClient,
        $or: [{ status: "failed" }, { disposition: { $in: ["No answer", "Voice mail"] } }],
      }),
      PaymentPromise.find({ ...byClient, createdAt: { $gte: since } }, "amount status createdAt").lean(),
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

    // Serie semanal completa (las semanas sin promesas salen en 0 para que la gráfica no se salte)
    // Se agrupa en JS (en vez de $dateTrunc) para no exigir MongoDB 5.0+
    const weekly = new Map<number, { promised: number; completed: number; count: number }>()
    promiseRows.forEach((p: any) => {
      const key = startOfWeek(new Date(p.createdAt)).getTime()
      const w = weekly.get(key) ?? { promised: 0, completed: 0, count: 0 }
      w.promised += p.amount || 0
      if (p.status === "completed") w.completed += p.amount || 0
      w.count += 1
      weekly.set(key, w)
    })
    const promiseWeekly = Array.from({ length: CHART_WEEKS }, (_, i) => {
      const weekStart = new Date(since)
      weekStart.setDate(since.getDate() + 7 * i)
      const w = weekly.get(weekStart.getTime())
      return {
        weekStart: weekStart.toISOString(),
        promised: w?.promised ?? 0,
        completed: w?.completed ?? 0,
        count: w?.count ?? 0,
      }
    })

    res.json({
      totalClients,
      activeClients,
      totalDebt,
      recoveredDebt,
      paymentPromises,
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
