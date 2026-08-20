import Message from '../models/Message'
import Client from '../models/Client'
import Conversation from '../models/Conversation'
import PaymentPromise from '../models/PaymentPromise'
import { findOrCreateConversation, updateConversationLastMessage } from './conversationService'
import { classifyIntent } from './intentClassifier'
import { advanceWhatsappFlow, FlowContext, FlowState } from './whatsappFlow.service'
import { sendWhatsappText } from './whatsappService'

// Maps local intent → score
const INTENT_TO_SCORE: Partial<Record<string, number>> = {
  promise_pay: 85,
  already_paid: 100,
  no_money: 20,
  insult: 10,
}

export async function processIncomingMessage(message: any) {
  try {
    const phone = String(message.from ?? '')
    const normalizedPhone = phone.slice(-10)
    const text = message.text?.body ?? ''
    const metaMessageId = message.id ?? null

    const client = await Client.findOne({ phone: { $regex: `${normalizedPhone}$` } })

    const { intent: localIntent } = classifyIntent(text)

    // Map intent classifier result to legacy intent names for backwards compat
    const intentMap: Record<string, string> = {
      already_paid: 'pago_realizado',
      promise_pay: 'promesa_pago',
      no_money: 'riesgo_alto',
      backchannel: 'saludo',
      unknown: 'general',
    }
    const detectedIntent = intentMap[localIntent] ?? localIntent

    const conversation = await findOrCreateConversation(phone, client?._id?.toString())

    const savedMessage = await Message.create({
      clientId: client?._id ?? null,
      conversationId: conversation._id,
      phone,
      debt: client?.debt ?? 0,
      channel: 'WhatsApp',
      direction: 'inbound',
      message: text,
      intent: detectedIntent,
      status: 'replied',
      reply: text,
      metaMessageId,
      metaResponse: message,
      aiProcessed: false,
      score: INTENT_TO_SCORE[localIntent] ?? 50,
    })

    await updateConversationLastMessage(conversation._id.toString(), text, 'inbound', true)

    if (client) {
      client.lastReply = text
      client.lastReplyAt = new Date()
      client.lastContactAt = new Date()
      client.lastIntent = detectedIntent
      client.totalMessages = (client.totalMessages ?? 0) + 1
      client.totalReplies = (client.totalReplies ?? 0) + 1

      const newScore = INTENT_TO_SCORE[localIntent]
      if (newScore !== undefined) client.score = newScore

      // Guion automatizado de WhatsApp ("llamada preventiva" — ver whatsappFlow.service.ts).
      // Reemplaza la actualización de estado/promesas que antes hacía el clasificador
      // general de arriba; ese clasificador se conserva solo para etiquetar Message.intent.
      if (conversation.flowState !== 'closed') {
        const flowClient = { _id: client._id, name: client.name, debt: client.debt, phone: client.phone }
        const result = await advanceWhatsappFlow(
          text,
          flowClient,
          (conversation.flowState as FlowState | null) ?? null,
          (conversation.flowContext as FlowContext) ?? {}
        )

        if (result.reply) {
          await sendWhatsappText(phone, result.reply, client._id.toString(), conversation._id.toString())
        }

        // findByIdAndUpdate (not conversation.save()) — sendWhatsappText already wrote
        // lastMessage/lastMessageAt via its own findByIdAndUpdate; saving this
        // in-memory doc afterward would overwrite that with stale values.
        const conversationUpdate: Record<string, unknown> = {
          flowState: result.newState,
          flowContext: result.newContext,
        }
        if (result.outcome) {
          conversationUpdate.flowOutcome = { ...result.outcome, updatedAt: new Date() }
          client.lastIntent = result.outcome.type
          if (result.outcome.type !== 'payment_promise') conversationUpdate.requiresFollowUp = true
        }
        await Conversation.findByIdAndUpdate(conversation._id, conversationUpdate)

        if (result.createPromise) {
          await PaymentPromise.create({
            clientId: client._id,
            messageId: savedMessage._id,
            amount: result.createPromise.amount,
            promisedDate: result.createPromise.date,
            status: 'pending',
            notes: 'Registrado vía flujo automatizado de WhatsApp (llamada preventiva)',
            detectedByAI: true,
          })
          client.status = 'promised'
        }
      }

      await client.save()
    }
  } catch (error) {
    console.error('[MessageProcessor] Error:', error)
  }
}
