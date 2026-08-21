import Message from '../models/Message'
import Client from '../models/Client'
import Conversation from '../models/Conversation'
import PaymentPromise from '../models/PaymentPromise'
import { findOrCreateConversation, updateConversationLastMessage } from './conversationService'
import { classifyIntent } from './intentClassifier'
import { advanceWhatsappFlow, FlowContext, FlowState } from './whatsappFlow.service'
import { sendWhatsappText } from './whatsappService'
import { bufferMessage } from './whatsappDebounce.cache'

// Maps local intent → score
const INTENT_TO_SCORE: Partial<Record<string, number>> = {
  promise_pay: 85,
  already_paid: 100,
  no_money: 20,
  insult: 10,
}

// Corre el guion automatizado sobre el texto YA combinado de un lote de
// mensajes (ver whatsappDebounce.cache.ts) — se dispara tras una pausa en la
// escritura del cliente, nunca inmediatamente al recibir cada mensaje suelto.
// Vuelve a leer cliente/conversación desde la DB porque corre con retraso
// respecto al webhook que lo programó.
async function runWhatsappFlowTurn(
  clientId: string,
  conversationId: string,
  phone: string,
  combinedText: string
): Promise<void> {
  const [client, conversation] = await Promise.all([
    Client.findById(clientId),
    Conversation.findById(conversationId),
  ])
  if (!client || !conversation) return
  if (conversation.flowState === 'closed') return

  const flowClient = { _id: client._id, name: client.name, debt: client.debt, phone: client.phone }
  const result = await advanceWhatsappFlow(
    combinedText,
    flowClient,
    (conversation.flowState as FlowState | null) ?? null,
    (conversation.flowContext as FlowContext) ?? {}
  )

  if (result.reply) {
    await sendWhatsappText(phone, result.reply, clientId, conversationId)
  }

  // findByIdAndUpdate (not conversation.save()) — sendWhatsappText already wrote
  // lastMessage/lastMessageAt via its own findByIdAndUpdate; saving this
  // in-memory doc afterward would overwrite that with stale values.
  const conversationUpdate: Record<string, unknown> = {
    flowState: result.newState,
    flowContext: result.newContext,
  }

  let newClientStatus: string | undefined
  let newClientIntent: string | undefined

  if (result.outcome) {
    conversationUpdate.flowOutcome = { ...result.outcome, updatedAt: new Date() }
    newClientIntent = result.outcome.type
    if (result.outcome.type !== 'payment_promise') conversationUpdate.requiresFollowUp = true
  }
  await Conversation.findByIdAndUpdate(conversationId, conversationUpdate)

  if (result.createPromise) {
    await PaymentPromise.create({
      clientId,
      amount: result.createPromise.amount,
      promisedDate: result.createPromise.date,
      status: 'pending',
      notes: 'Registrado vía flujo automatizado de WhatsApp (llamada preventiva)',
      detectedByAI: true,
    })
    newClientStatus = 'promised'
  }

  if (newClientStatus || newClientIntent) {
    await Client.findByIdAndUpdate(clientId, {
      ...(newClientStatus ? { status: newClientStatus } : {}),
      ...(newClientIntent ? { lastIntent: newClientIntent } : {}),
    })
  }
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

    await Message.create({
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

      await client.save()

      // Guion automatizado de WhatsApp ("llamada preventiva" — ver whatsappFlow.service.ts).
      // Reemplaza la actualización de estado/promesas que antes hacía el clasificador
      // general de arriba; ese clasificador se conserva solo para etiquetar Message.intent.
      // No corre inline: si el cliente escribe varios mensajes seguidos (varios
      // renglones), esperamos una pausa y los procesamos juntos como un solo turno
      // — ver whatsappDebounce.cache.ts.
      if (conversation.flowState !== 'closed') {
        const clientId = client._id.toString()
        const conversationId = conversation._id.toString()
        bufferMessage(conversationId, text, (combinedText) =>
          runWhatsappFlowTurn(clientId, conversationId, phone, combinedText)
        )
      }
    }
  } catch (error) {
    console.error('[MessageProcessor] Error:', error)
  }
}
