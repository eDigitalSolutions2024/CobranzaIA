import Conversation from "../models/Conversation"
import Client from "../models/Client"

export async function findOrCreateConversation(
  phone: string,
  clientId?: string | null
) {
  let conversation = await Conversation.findOne({ phone })

  if (!conversation) {
    let resolvedClientId = clientId || null

    if (!resolvedClientId) {
      const normalizedPhone = phone.slice(-10)
      const client = await Client.findOne({ phone: { $regex: normalizedPhone } })
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
