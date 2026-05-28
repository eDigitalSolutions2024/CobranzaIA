import { Request, Response } from "express"
import Message from "../models/Message"

export async function getMessages(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit) || 20

    const messages = await Message.find()
      .populate("clientId", "name phone")
      .sort({ createdAt: -1 })
      .limit(limit)

    res.json(messages)
  } catch (error) {
    console.log("Error getMessages:", error)
    res.status(500).json({ message: "Error obteniendo mensajes" })
  }
}
