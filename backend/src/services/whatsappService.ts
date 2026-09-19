import axios, { AxiosError } from 'axios'
import Message from '../models/Message'
import Conversation from '../models/Conversation'
import Client from '../models/Client'
import { findOrCreateConversation, updateConversationLastMessage } from './conversationService'
import { normalizeMexicanPhone } from '../utils/phone'

// ── Horario hábil + tope diario (evitar acoso) ──────────────────────────────
// Solo aplica a mensajes PROACTIVOS (esta función, prepareWhatsappMessage — recordatorios,
// fallback de números, ciclo automático de cobranza). Las respuestas del bot dentro de
// una conversación activa (sendWhatsappText, más abajo) NO se bloquean por esto: si el
// cliente ya está escribiendo a las 11pm, no tiene sentido dejarlo esperando horas por
// una respuesta a algo que él mismo inició.
const BUSINESS_HOURS_START = 8
const BUSINESS_HOURS_END = 18
const MAX_PROACTIVE_MESSAGES_PER_DAY = 3

// Mismo env var que autoCallScheduler.service.ts/voice.controller.ts — en modo prueba
// tampoco tiene sentido esperar a que abra la ventana de horario hábil real para ver
// los pasos 3/4 (mensajes) del ciclo de prueba.
const AUTO_CALL_TEST_MODE = process.env.AUTO_CALL_TEST_MODE === 'true'

function isWithinBusinessHours(): boolean {
  if (AUTO_CALL_TEST_MODE) return true
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(
      new Date()
    )
  )
  return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END
}

// Cuenta mensajes proactivos (identificados por el prefijo "[Template:" que
// prepareWhatsappMessage siempre guarda) mandados a este teléfono en las últimas 24h —
// ventana móvil, no "día calendario", para no depender de a qué hora se reinicia el
// conteo.
async function countRecentProactiveMessages(phone: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return Message.countDocuments({
    phone,
    direction: 'outbound',
    createdAt: { $gte: since },
    message: { $regex: '^\\[Template:' },
  })
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

  // Ambos casos lanzan un error reconocible en vez de fallar en silencio — cada llamador
  // (reminderScheduler, phoneFallback, autoCallScheduler) decide qué hacer, pero todos ya
  // reintentan en su siguiente corrida por diseño, así que "fallar" aquí basta para que
  // se reintente en cuanto se reabra la ventana en vez de perderse.
  if (!isWithinBusinessHours()) {
    throw new Error('OUTSIDE_BUSINESS_HOURS')
  }
  if (!AUTO_CALL_TEST_MODE) {
    const recentCount = await countRecentProactiveMessages(toPhone)
    if (recentCount >= MAX_PROACTIVE_MESSAGES_PER_DAY) {
      throw new Error('DAILY_MESSAGE_CAP_REACHED')
    }
  }

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
