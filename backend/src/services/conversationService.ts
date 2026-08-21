import Conversation from "../models/Conversation"
import Client from "../models/Client"

export async function findOrCreateConversation(
  phone: string,
  clientId?: string | null
) {
  // Los mensajes salientes guardan el teléfono como "+52..." y los webhooks
  // entrantes de Meta lo mandan como "521..." (sin +, con el "1" móvil) — dos
  // representaciones del mismo número. Buscamos por los últimos 10 dígitos
  // para que ambos casos encuentren la misma conversación.
  const last10 = phone.replace(/\D/g, "").slice(-10)
  let conversation = await Conversation.findOne({ phone: { $regex: `${last10}$` } })

  if (!conversation) {
    let resolvedClientId = clientId || null

    if (!resolvedClientId) {
      const client = await Client.findOne({ phone: { $regex: `${last10}$` } })
      resolvedClientId = client?._id?.toString() || null
    }

    conversation = await Conversation.create({
      phone,
      clientId: resolvedClientId,
      status: "active",
      unreadCount: 0,
    })
  } else if (clientId && !conversation.clientId) {
    conversation.clientId = clientId as any
    await conversation.save()
  }

  return conversation
}

export async function updateConversationLastMessage(
  conversationId: string,
  message: string,
  direction: "inbound" | "outbound",
  incrementUnread = false
) {
  const newStatus =
    direction === "inbound" ? "awaiting_agent" : "awaiting_client"

  if (incrementUnread) {
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message,
      lastMessageAt: new Date(),
      lastDirection: direction,
      status: newStatus,
      $inc: { unreadCount: 1 },
    })
  } else {
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message,
      lastMessageAt: new Date(),
      lastDirection: direction,
      status: newStatus,
    })
  }
}
