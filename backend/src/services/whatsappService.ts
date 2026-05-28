import axios from "axios"
import Message from "../models/Message"
import {
  findOrCreateConversation,
  updateConversationLastMessage,
} from "./conversationService"

export async function prepareWhatsappMessage(data: any) {
  console.log("Enviando template a Meta:", data.template, "→", data.phone)

  const toPhone = data.phone.startsWith("52")
    ? data.phone
    : `52${data.phone}`

  const templateName = data.template || "cobranza_recordatorio"

  const response = await axios.post(
    `https://graph.facebook.com/v25.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: toPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es_MX" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: data.clientName },
              { type: "text", text: String(data.debt) },
            ],
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  )

  const metaMessageId = response.data.messages?.[0]?.id || null

  const conversation = await findOrCreateConversation(
    toPhone,
    data.clientId || null
  )

  const messageText = `[Template: ${templateName}] ${data.clientName} — $${Number(data.debt).toLocaleString("es-MX")} MXN`

  const saved = await Message.create({
    clientId: data.clientId || null,
    conversationId: conversation._id,
    phone: toPhone,
    debt: data.debt,
    channel: data.channel || "WhatsApp",
    direction: "outbound",
    message: messageText,
    status: "sent",
    metaResponse: response.data,
    metaMessageId,
  })

  await updateConversationLastMessage(
    conversation._id.toString(),
    messageText,
    "outbound",
    false
  )

  return {
    sent: true,
    messageId: metaMessageId,
    saved,
  }
}
