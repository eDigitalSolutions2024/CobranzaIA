import Message from '../models/Message'
import Client from '../models/Client'
import Conversation from '../models/Conversation'
import PaymentPromise from '../models/PaymentPromise'
import Ticket from '../models/Ticket'
import { findOrCreateConversation, updateConversationLastMessage } from './conversationService'
import { classifyIntent } from './intentClassifier'
import { advanceWhatsappFlow, FlowContext, FlowState } from './whatsappFlow.service'
import { sendWhatsappText, sendTypingIndicator } from './whatsappService'
import { bufferMessage } from './whatsappDebounce.cache'
import { DispositionStatus, nextActionFor } from '../config/disposition'
import { endOfCurrentMonthMexicoCity } from '../utils/collectionExclusion'

// Traduce el outcome.type que ya calculó el guion (whatsappFlow.service.ts) al
// Status del catálogo fijo — no es una clasificación de IA aparte, es una
// traducción determinística de una decisión que el guion ya tomó. 'pending_human'
// usa 'Prefers CAS support' como el status más cercano a "se escaló a un humano"
// (mismo criterio que la llamada de voz, ver voice.controller.ts).
const WHATSAPP_OUTCOME_TO_STATUS: Record<string, DispositionStatus> = {
  payment_promise: 'Payment scheduled',
  reported_payment: 'Payment received',
  domiciliado: 'Payment scheduled',
  callback_later: 'Follow up',
  no_payment_capacity: 'Follow up',
  dispute_amount: 'Invoice, statement or contract required',
  dispute_invoice: 'Invoice, statement or contract required',
  wrong_contact: 'Wrong number',
  resend_invoice: 'Need invoice',
  pending_human: 'Prefers CAS support',
  payment_refusal: 'Payment refused',
  payment_in_process: 'Payment in process',
}

// Escenarios de la tarjeta "Exclusión automática de clientes del ciclo mensual de
// cobranza" detectables por WhatsApp — cada uno con el motivo legible que se guarda en
// Client.collectionExclusionReason (ver excludeFromCollectionWhatsapp abajo).
const COLLECTION_EXCLUSION_REASON: Partial<Record<string, string>> = {
  reported_payment: 'Pago reportado',
  domiciliado: 'Pago domiciliado',
  payment_in_process: 'Pago en proceso',
}

// Maps local intent → score
const INTENT_TO_SCORE: Partial<Record<string, number>> = {
  promise_pay: 85,
  already_paid: 100,
  no_money: 20,
  insult: 10,
}

// Outcomes en los que el bot NO debe reabrir el guion aunque el número vuelva
// a escribir: número equivocado (no es el cliente) o disputa de factura (un
// humano tiene que revisar documentos). Se quedan en el inbox para que los
// atienda una persona.
//
// pending_human queda fuera a propósito: el ticket/escalamiento para el
// humano se mantiene igual (no se toca ni se resuelve solo), pero el bot sí
// puede seguir atendiendo si el cliente escribe algo más — pasa por el mismo
// razonamiento de reentrada que cualquier conversación cerrada (ver
// whatsappFlow.service.ts, rama `checkingReentry`), que puede decidir no
// hacer nada si es solo cortesía.
const HUMAN_OWNED_OUTCOMES = new Set(['wrong_contact', 'dispute_invoice'])

// Simula el tiempo que tardaría una persona en escribir la respuesta, para
// que el bot no conteste de golpe. Basado en una velocidad de tecleo
// promedio (~40 palabras/min), acotado para no hacer esperar de más.
const WORDS_PER_MINUTE = 40
const MIN_TYPING_MS = 1_200
const MAX_TYPING_MS = 6_000

function computeTypingDelayMs(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  const ms = (wordCount / WORDS_PER_MINUTE) * 60_000
  return Math.min(MAX_TYPING_MS, Math.max(MIN_TYPING_MS, ms))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  combinedText: string,
  lastMetaMessageId: string | null
): Promise<void> {
  const [client, conversation] = await Promise.all([
    Client.findById(clientId),
    Conversation.findById(conversationId),
  ])
  if (!client || !conversation) return

  const isClosed = conversation.flowState === 'closed'
  // Un humano ya se hizo cargo (o número equivocado) — no le entra el bot.
  if (isClosed && HUMAN_OWNED_OUTCOMES.has((conversation.flowOutcome as any)?.type)) return

  // Si estaba cerrado, no asumimos ningún estado — dejamos que el clasificador
  // de reentrada razone el mensaje (puede decidir no hacer nada, ver
  // whatsappFlow.service.ts).
  const state: FlowState | null = isClosed ? 'closed' : ((conversation.flowState as FlowState | null) ?? null)
  const context: FlowContext = isClosed ? { checkingReentry: true } : ((conversation.flowContext as FlowContext) ?? {})

  const flowClient = { _id: client._id, name: client.name, debt: client.debt, phone: client.phone }
  const result = await advanceWhatsappFlow(combinedText, flowClient, state, context)

  if (result.reply) {
    // Refresca "escribiendo..." (el de la llegada del mensaje ya pudo haber
    // expirado) y espera lo que tardaría alguien en teclear esta respuesta.
    if (lastMetaMessageId) sendTypingIndicator(lastMetaMessageId).catch(() => {})
    await sleep(computeTypingDelayMs(result.reply))
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
  let newClientNextAction: string | undefined

  if (result.outcome) {
    conversationUpdate.flowOutcome = { ...result.outcome, updatedAt: new Date() }
    newClientIntent = result.outcome.type
    if (result.outcome.type !== 'payment_promise') conversationUpdate.requiresFollowUp = true

    const status = WHATSAPP_OUTCOME_TO_STATUS[result.outcome.type]
    if (status) {
      newClientNextAction = nextActionFor(status)
      conversationUpdate.disposition = status
      conversationUpdate.nextAction = newClientNextAction
    }

    // Negativa explícita de pago detectada por WhatsApp — mismo tratamiento que la voz
    // (ver flowActions.service.ts, crm.mark_payment_refusal): marca al cliente como
    // CANDIDATO a Blacklist (no confirmado todavía) y abre un Ticket para que un
    // administrador lo revise. Ver tarjeta "Implementar Blacklist de Clientes Morosos".
    if (result.outcome.type === 'payment_refusal') {
      const reason = result.outcome.notes?.trim() || 'Sin motivo especificado'
      await Ticket.create({
        clientId,
        phone,
        reason: 'payment_refusal',
        status: 'open',
        notes: `Negativa de pago detectada por WhatsApp: "${reason}"`,
      })
      await Client.findByIdAndUpdate(clientId, {
        blacklistStatus: 'candidate',
        blacklistReason: reason,
        blacklistMarkedAt: new Date(),
      })
    }

    // Pago reportado/en proceso/domiciliado detectado por WhatsApp — ver tarjeta
    // "Exclusión automática de clientes del ciclo mensual de cobranza": se pausa el
    // ciclo automático (autoCallScheduler.service.ts / reminderScheduler.service.ts)
    // hasta fin de mes, SIN marcar el pago como confirmado ni tocar debt/status — el
    // Ticket abierto es la tarea real de verificación/conciliación (ver mismo
    // tratamiento en flowActions.service.ts, excludeFromCollection, para voz).
    const exclusionReason = COLLECTION_EXCLUSION_REASON[result.outcome.type]
    if (exclusionReason) {
      const detail = result.outcome.notes?.trim()
      await Ticket.create({
        clientId,
        phone,
        reason: result.outcome.type,
        status: result.outcome.type === 'domiciliado' ? 'closed' : 'open',
        notes: `${exclusionReason} detectado por WhatsApp${detail ? `: "${detail}"` : ''}`,
      })
      await Client.findByIdAndUpdate(clientId, {
        collectionExcludedUntil: endOfCurrentMonthMexicoCity(),
        collectionExclusionReason: exclusionReason,
        collectionExcludedAt: new Date(),
      })
    }
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

  if (newClientStatus || newClientIntent || newClientNextAction) {
    await Client.findByIdAndUpdate(clientId, {
      ...(newClientStatus ? { status: newClientStatus } : {}),
      ...(newClientIntent ? { lastIntent: newClientIntent } : {}),
      ...(newClientNextAction ? { nextAction: newClientNextAction } : {}),
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

    // Marca el mensaje como leído y muestra "escribiendo..." mientras esperamos
    // el margen de silencio del debounce — no bloquea la respuesta al webhook.
    if (metaMessageId) {
      sendTypingIndicator(metaMessageId).catch(() => {})
    }

    if (client) {
      client.lastReply = text
      client.lastReplyAt = new Date()
      client.lastContactAt = new Date()
      client.lastIntent = detectedIntent
      client.totalMessages = (client.totalMessages ?? 0) + 1
      client.totalReplies = (client.totalReplies ?? 0) + 1

      const newScore = INTENT_TO_SCORE[localIntent]
      if (newScore !== undefined) client.score = newScore

      // El cliente respondió — cancela el fallback automático de números
      // alternos (ver phoneFallback.service.ts), sin importar en qué número
      // haya contestado.
      client.outreachSentAt = null as any

      await client.save()

      // Guion automatizado de WhatsApp ("llamada preventiva" — ver whatsappFlow.service.ts).
      // Reemplaza la actualización de estado/promesas que antes hacía el clasificador
      // general de arriba; ese clasificador se conserva solo para etiquetar Message.intent.
      // No corre inline: si el cliente escribe varios mensajes seguidos (varios
      // renglones), esperamos una pausa y los procesamos juntos como un solo turno
      // — ver whatsappDebounce.cache.ts. Si la conversación ya había cerrado,
      // igual se encola: runWhatsappFlowTurn decide si reabrir (razonando el
      // mensaje) o dejarlo así — salvo que ya esté en manos de un humano.
      const isHumanOwned = conversation.flowState === 'closed'
        && HUMAN_OWNED_OUTCOMES.has((conversation.flowOutcome as any)?.type)

      if (!isHumanOwned) {
        const clientId = client._id.toString()
        const conversationId = conversation._id.toString()
        bufferMessage(conversationId, text, metaMessageId, (combinedText, lastMetaMessageId) =>
          runWhatsappFlowTurn(clientId, conversationId, phone, combinedText, lastMetaMessageId)
        )
      }
    }
  } catch (error) {
    console.error('[MessageProcessor] Error:', error)
  }
}
