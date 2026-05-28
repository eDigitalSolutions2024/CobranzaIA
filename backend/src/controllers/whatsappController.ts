import { Request, Response } from "express"
import { prepareWhatsappMessage } from "../services/whatsappService"
import { processIncomingMessage } from "../services/messageProcessor"
import Message from "../models/Message"
import WhatsAppStatus from "../models/WhatsAppStatus"

export async function sendWhatsapp(req: Request, res: Response) {
  try {
    const result = await prepareWhatsappMessage(req.body)

    res.status(200).json({
      success: true,
      message: "Mensaje enviado",
      data: result,
    })
  } catch (error: any) {
    console.log("Error sendWhatsapp:", error?.response?.data || error)

    res.status(500).json({
      success: false,
      message: "Error enviando mensaje",
      error: error?.response?.data || null,
    })
  }
}

// META → valida webhook GET
export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"]
  const token = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente")
    return res.status(200).send(challenge)
  }

  console.log("Webhook: token inválido")
  return res.sendStatus(403)
}

async function processStatusUpdate(statusUpdate: any) {
  try {
    const metaMessageId = statusUpdate.id
    const status = statusUpdate.status

    if (!metaMessageId || !status) return

    // Actualizar estado en el mensaje original
    const updated = await Message.findOneAndUpdate(
      { metaMessageId },
      { status },
      { new: true }
    )

    // Guardar registro de auditoría
    await WhatsAppStatus.create({
      messageId: updated?._id || null,
      metaMessageId,
      status,
      rawData: statusUpdate,
    })

    console.log(`Status actualizado: ${metaMessageId} → ${status}`)
  } catch (error) {
    console.log("Error processStatusUpdate:", error)
  }
}

// META → recibe eventos POST
export async function receiveWebhook(req: Request, res: Response) {
  try {
    const body = req.body

    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value

    // Mensajes entrantes
    if (value?.messages) {
      for (const message of value.messages) {
        await processIncomingMessage(message)
      }
    }

    // Estados: sent, delivered, read, failed
    if (value?.statuses) {
      for (const statusUpdate of value.statuses) {
        await processStatusUpdate(statusUpdate)
      }
    }

    return res.sendStatus(200)
  } catch (error) {
    console.log("Error receiveWebhook:", error)
    return res.sendStatus(500)
  }
}
