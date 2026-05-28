import Message from "../models/Message"
import Client from "../models/Client"
import PaymentPromise from "../models/PaymentPromise"
import {
  findOrCreateConversation,
  updateConversationLastMessage,
} from "./conversationService"

function detectIntent(text: string): string {
  const t = text.toLowerCase()

  if (
    t.includes("ya pagué") ||
    t.includes("ya pague") ||
    t.includes("ya realicé") ||
    t.includes("ya realize") ||
    t.includes("ya deposité") ||
    t.includes("ya deposite")
  ) {
    return "pago_realizado"
  }

  if (
    t.includes("mañana") ||
    t.includes("pago") ||
    t.includes("pagar") ||
    t.includes("transferencia") ||
    t.includes("depósito") ||
    t.includes("deposito") ||
    t.includes("te pago") ||
    t.includes("voy a pagar")
  ) {
    return "promesa_pago"
  }

  if (
    t.includes("no tengo") ||
    t.includes("sin dinero") ||
    t.includes("no puedo") ||
    t.includes("imposible") ||
    t.includes("no hay")
  ) {
    return "riesgo_alto"
  }

  if (
    t.includes("hola") ||
    t.includes("buenas") ||
    t.includes("buen día") ||
    t.includes("quien es") ||
    t.includes("quién es")
  ) {
    return "saludo"
  }

  return "general"
}

export async function processIncomingMessage(message: any) {
  try {
    const phone = String(message.from || "")
    const normalizedPhone = phone.slice(-10)
    const text = message.text?.body || ""
    const metaMessageId = message.id || null

    console.log("Procesando mensaje...", { phone, normalizedPhone, text, metaMessageId })

    const client = await Client.findOne({
      phone: { $regex: normalizedPhone },
    })

    console.log("CLIENTE:", client?.name || "SIN CLIENTE")

    const detectedIntent = detectIntent(text)

    console.log("INTENCION:", detectedIntent)

    const conversation = await findOrCreateConversation(
      phone,
      client?._id?.toString()
    )

    const savedMessage = await Message.create({
      clientId: client?._id || null,
      conversationId: conversation._id,
      phone,
      debt: client?.debt || 0,
      channel: "WhatsApp",
      direction: "inbound",
      message: text,
      intent: detectedIntent,
      status: "replied",
      reply: text,
      metaMessageId,
      metaResponse: message,
      aiProcessed: false,
      score: detectedIntent === "riesgo_alto" ? 20 : 80,
    })

    console.log("MENSAJE GUARDADO:", savedMessage._id)

    await updateConversationLastMessage(
      conversation._id.toString(),
      text,
      "inbound",
      true
    )

    if (client) {
      client.lastReply = text
      client.lastReplyAt = new Date()
      client.lastContactAt = new Date()
      client.lastIntent = detectedIntent
      client.totalMessages = (client.totalMessages || 0) + 1
      client.totalReplies = (client.totalReplies || 0) + 1

      if (detectedIntent === "promesa_pago") {
        client.status = "promised"
        client.score = 85

        const promisedDate = new Date()
        promisedDate.setDate(promisedDate.getDate() + 3)

        await PaymentPromise.create({
          clientId: client._id,
          messageId: savedMessage._id,
          amount: client.debt,
          promisedDate,
          status: "pending",
          notes: `IA detectó promesa en: "${text.substring(0, 100)}"`,
          detectedByAI: true,
        })

        console.log("PROMESA DE PAGO REGISTRADA")
      }

      if (detectedIntent === "pago_realizado") {
        client.status = "paid"
        client.score = 100
      }

      if (detectedIntent === "riesgo_alto") {
        client.risk = "high"
        client.status = "negotiating"
        client.score = 20
      }

      await client.save()
      console.log("CLIENTE ACTUALIZADO")
    }
  } catch (error) {
    console.log("ERROR processIncomingMessage:", error)
  }
}
