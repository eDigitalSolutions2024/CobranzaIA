import axios, { AxiosError } from 'axios'
import Message from '../models/Message'
import Conversation from '../models/Conversation'
import Client from '../models/Client'
import { findOrCreateConversation, updateConversationLastMessage } from './conversationService'
import { normalizeMexicanPhone } from '../utils/phone'

async function postWithRetry(url: string, data: unknown, headers: Record<string, string>, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(url, data, { headers, timeout: 10_000 })
      return res.data
    } catch (err) {
      const isLast = attempt === retries
      const status = (err as AxiosError)?.response?.status
      // Don't retry on 4xx (bad request, invalid template, etc.)
      if (status && status >= 400 && status < 500) throw err
      if (isLast) throw err
      const delay = attempt * 1000
      console.warn(`[WhatsApp] Intento ${attempt}/${retries} fallido — reintentando en ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

export async function prepareWhatsappMessage(data: any) {
  const toPhone = normalizeMexicanPhone(String(data.phone ?? ''))
  const templateName = data.template || 'cobranza_recordatorio'

  const metaUrl = `https://graph.facebook.com/v25.0/${process.env.META_PHONE_NUMBER_ID}/messages`
  const headers = {
    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es_MX' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(data.clientName ?? '') },
            { type: 'text', text: String(data.debt ?? '0') },
          ],
        },
      ],
    },
  }

  const responseData = await postWithRetry(metaUrl, payload, headers)
  const metaMessageId = responseData?.messages?.[0]?.id ?? null

  const conversation = await findOrCreateConversation(toPhone, data.clientId ?? null)

  // Un template nuevo es un contacto nuevo — si el guion automatizado ya había
  // cerrado (promesa registrada, escalado a humano, etc.), lo reiniciamos para
  // que la próxima respuesta del cliente arranque el guion desde el paso 1.
  if (conversation.flowState === 'closed') {
    await Conversation.findByIdAndUpdate(conversation._id, {
      flowState: null,
      flowContext: {},
      flowOutcome: { type: null, amount: null, date: null, notes: null, updatedAt: null },
      requiresFollowUp: false,
    })
  }

  const messageText = `[Template: ${templateName}] ${data.clientName} — $${Number(data.debt).toLocaleString('es-MX')} MXN`

  const saved = await Message.create({
    clientId: data.clientId ?? null,
    conversationId: conversation._id,
    phone: toPhone,
    debt: data.debt,
    channel: data.channel ?? 'WhatsApp',
    direction: 'outbound',
    message: messageText,
    status: 'sent',
    metaResponse: responseData,
    metaMessageId,
  })

  await updateConversationLastMessage(conversation._id.toString(), messageText, 'outbound', false)

  // Marca el intento de contacto para el fallback automático de números
  // alternos (ver phoneFallback.service.ts) — si no manda outreachPhoneIndex
  // explícito (envío manual o recordatorio normal), es un contacto nuevo al
  // número principal y el fallback arranca desde cero.
  if (data.clientId) {
    await Client.findByIdAndUpdate(data.clientId, {
      outreachPhoneIndex: data.outreachPhoneIndex ?? 0,
      outreachSentAt: new Date(),
      outreachExhausted: false,
    })
  }

  return { sent: true, messageId: metaMessageId, saved }
}

// Sends a freeform text message — only valid within Meta's 24h customer service
// window (i.e. after the client has replied). No template/approval required.
export async function sendWhatsappText(
  toPhone: string,
  text: string,
  clientId: string | null,
  conversationId: string
): Promise<{ sent: boolean; messageId: string | null }> {
  const metaUrl = `https://graph.facebook.com/v25.0/${process.env.META_PHONE_NUMBER_ID}/messages`
  const headers = {
    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'text',
    text: { body: text },
  }

  const responseData = await postWithRetry(metaUrl, payload, headers)
  const metaMessageId = responseData?.messages?.[0]?.id ?? null

  await Message.create({
    clientId,
    conversationId,
    phone: toPhone,
    channel: 'WhatsApp',
    direction: 'outbound',
    message: text,
    status: 'sent',
    metaResponse: responseData,
    metaMessageId,
  })

  await updateConversationLastMessage(conversationId, text, 'outbound', false)

  return { sent: true, messageId: metaMessageId }
}

// Marca el mensaje entrante como leído y muestra el indicador "escribiendo..."
// del lado del cliente (dura hasta ~25s o hasta que llegue la respuesta real).
// Se usa mientras esperamos el margen de silencio del debounce, para que no
// parezca que el bot no vio el mensaje.
export async function sendTypingIndicator(incomingMetaMessageId: string): Promise<void> {
  const metaUrl = `https://graph.facebook.com/v25.0/${process.env.META_PHONE_NUMBER_ID}/messages`
  const headers = {
    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }

  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: incomingMetaMessageId,
    typing_indicator: { type: 'text' },
  }

  try {
    await axios.post(metaUrl, payload, { headers, timeout: 10_000 })
  } catch (err) {
    // No crítico — si falla, el cliente simplemente no ve "escribiendo...".
    console.warn('[WhatsApp] No se pudo mostrar el indicador de escribiendo:', (err as AxiosError)?.message)
  }
}
