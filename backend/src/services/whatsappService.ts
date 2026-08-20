import axios, { AxiosError } from 'axios'
import Message from '../models/Message'
import Conversation from '../models/Conversation'
import { findOrCreateConversation, updateConversationLastMessage } from './conversationService'

// Normalize to E.164 Mexico format: strips everything, ensures +52 prefix
function normalizeMexicanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Already has country code
  if (digits.startsWith('521') && digits.length === 13) return `+${digits}`
  if (digits.startsWith('52') && digits.length === 12) return `+${digits}`
  // 10-digit local number
  if (digits.length === 10) return `+52${digits}`
  // Fallback: return as-is with +
  return `+${digits}`
}

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
