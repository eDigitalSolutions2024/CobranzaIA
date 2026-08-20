import { Request, Response } from "express"
import Conversation from "../models/Conversation"
import Message from "../models/Message"

export async function getConversations(req: Request, res: Response) {
  try {
    const conversations = await Conversation.find()
      .populate("clientId", "name phone debt risk status")
      .sort({ lastMessageAt: -1 })
      .limit(100)

    res.json(conversations)
  } catch (error) {
    console.log("Error getConversations:", error)
    res.status(500).json({ message: "Error obteniendo conversaciones" })
  }
}

export async function getConversationMessages(req: Request, res: Response) {
  try {
    const { id } = req.params

    const limit = Math.min(200, Number(req.query.limit) || 50)
    const messages = await Message.find({ conversationId: id })
      .sort({ createdAt: 1 })
      .limit(limit)

    res.json(messages)
  } catch (error) {
    console.log("Error getConversationMessages:", error)
    res.status(500).json({ message: "Error obteniendo mensajes" })
  }
}

export async function markConversationRead(req: Request, res: Response) {
  try {
    const { id } = req.params

    await Conversation.findByIdAndUpdate(id, { unreadCount: 0 })

    res.json({ success: true })
  } catch (error) {
    console.log("Error markConversationRead:", error)
    res.status(500).json({ message: "Error actualizando conversación" })
  }
}
