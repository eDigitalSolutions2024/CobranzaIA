import { Request, Response } from "express"
import Client from "../models/Client"
import Message from "../models/Message"
import PaymentPromise from "../models/PaymentPromise"
import Conversation from "../models/Conversation"
import Call from "../models/Call"

export async function getMetrics(req: Request, res: Response) {
  try {
    const [
      totalClients,
      activeClients,
      debtAgg,
      recoveredAgg,
      paymentPromises,
      clientsWithReplies,
      riskAgg,
      messageStatusAgg,
      conversationStatusAgg,
      callStatusAgg,
      callsWithPromise,
    ] = await Promise.all([
      Client.countDocuments(),
      Client.countDocuments({ status: { $ne: "paid" } }),
      Client.aggregate([{ $group: { _id: null, total: { $sum: "$debt" } } }]),
      Client.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, total: { $sum: "$debt" } } }]),
      PaymentPromise.countDocuments({ status: "pending" }),
      Client.countDocuments({ totalReplies: { $gt: 0 } }),
      Client.aggregate([{ $group: { _id: "$risk", count: { $sum: 1 } } }]),
      Message.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Conversation.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Call.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Call.countDocuments({ promiseDate: { $ne: null } }),
    ])

    const totalDebt = debtAgg[0]?.total || 0
    const recoveredDebt = recoveredAgg[0]?.total || 0
    const responseRate =
      totalClients > 0
        ? Math.round((clientsWithReplies / totalClients) * 100)
        : 0

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
      callStats: { ...callStats, total: totalCalls, withPromise: callsWithPromise },
    })
  } catch (error) {
    console.log("Error getMetrics:", error)
    res.status(500).json({ message: "Error calculando métricas" })
  }
}
