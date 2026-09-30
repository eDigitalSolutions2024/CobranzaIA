// Tarifas usadas SOLO para estimar costo en el dashboard de Recursos (usageController.ts).
// No son facturación real — son aproximaciones a precio de lista público al momento de
// escribir esto (ago-2026). Las tarifas reales dependen del contrato/volumen de cada
// proveedor y cambian con el tiempo, así que todas son sobreescribibles por .env sin
// tocar código. Ajusta estos valores a lo que de verdad se está pagando.

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]
  const parsed = raw !== undefined ? Number(raw) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

// El modelo Realtime que se usa (OPENAI_REALTIME_MODEL) define la tarifa por defecto: el
// "mini" cuesta mucho menos que el completo. Antes el default era siempre el del modelo
// completo, y el panel sobreestimaba OpenAI ~3-6x con gpt-realtime-mini en producción.
const IS_REALTIME_MINI = (process.env.OPENAI_REALTIME_MODEL ?? '').includes('mini')

export const PRICING = {
  // OpenAI Realtime API (modelo de voz en vivo) — precio de lista por millón de tokens
  // (sep-2026: mini $0.60/$2.40 texto, $10/$20 audio; completo $4/$16 texto, $32/$64
  // audio). El audio se cobra a una tarifa muy distinta (más cara) que el texto, por eso
  // van separados. No considera el descuento por tokens en caché (no se registra cuántos
  // fueron), así que es el techo del costo real.
  openaiRealtime: {
    textInputPerM: envFloat('PRICING_OPENAI_REALTIME_TEXT_INPUT_PER_M', IS_REALTIME_MINI ? 0.6 : 4),
    textOutputPerM: envFloat('PRICING_OPENAI_REALTIME_TEXT_OUTPUT_PER_M', IS_REALTIME_MINI ? 2.4 : 16),
    audioInputPerM: envFloat('PRICING_OPENAI_REALTIME_AUDIO_INPUT_PER_M', IS_REALTIME_MINI ? 10 : 32),
    audioOutputPerM: envFloat('PRICING_OPENAI_REALTIME_AUDIO_OUTPUT_PER_M', IS_REALTIME_MINI ? 20 : 64),
  },
  // Deepgram Nova-3 streaming (transcripción del motor ElevenLabs) — por minuto de audio
  // escuchado; la conexión queda abierta toda la llamada, así que se estima con la duración
  // de la llamada. Precio de lista $0.0077/min (hay promoción temporal de $0.0048).
  deepgram: {
    perMinuteUsd: envFloat('PRICING_DEEPGRAM_PER_MINUTE_USD', 0.0077),
  },
  // ElevenLabs Flash v2.5 (voz del motor ElevenLabs) — por cada 1,000 caracteres que dice
  // el agente, a precio de API por uso. Con plan de suscripción el costo efectivo cambia.
  elevenlabs: {
    per1kCharsUsd: envFloat('PRICING_ELEVENLABS_PER_1K_CHARS_USD', 0.05),
  },
  // Claude Haiku 4.5 — usado en el resumen post-llamada (claudeVoice.service.ts).
  // Verificar contra https://www.anthropic.com/pricing.
  claudeHaiku: {
    inputPerM: envFloat('PRICING_CLAUDE_HAIKU_INPUT_PER_M', 1),
    outputPerM: envFloat('PRICING_CLAUDE_HAIKU_OUTPUT_PER_M', 5),
  },
  // Twilio — costo por minuto de llamada de voz. Varía MUCHO por país/tipo de número;
  // el default es un placeholder genérico, no una tarifa real para México. Ajustar según
  // lo que muestre la consola de Twilio para el número/destino que se esté usando.
  twilio: {
    perMinuteUsd: envFloat('PRICING_TWILIO_PER_MINUTE_USD', 0.02),
  },
  // Meta WhatsApp Cloud API — el cobro real de Meta es por CONVERSACIÓN (ventana de 24h,
  // categorizada en marketing/utility/service/authentication), no por mensaje individual.
  // Este valor es un promedio aproximado por mensaje saliente, útil solo para tener una
  // referencia de orden de magnitud — no para conciliar contra la factura real de Meta.
  whatsapp: {
    perOutboundMessageUsd: envFloat('PRICING_WHATSAPP_PER_MESSAGE_USD', 0.04),
  },
}

export function estimateOpenAICostUsd(usage: {
  inputTextTokens: number
  inputAudioTokens: number
  outputTextTokens: number
  outputAudioTokens: number
}): number {
  const p = PRICING.openaiRealtime
  return (
    (usage.inputTextTokens / 1_000_000) * p.textInputPerM +
    (usage.inputAudioTokens / 1_000_000) * p.audioInputPerM +
    (usage.outputTextTokens / 1_000_000) * p.textOutputPerM +
    (usage.outputAudioTokens / 1_000_000) * p.audioOutputPerM
  )
}

export function estimateClaudeCostUsd(usage: { inputTokens: number; outputTokens: number }): number {
  const p = PRICING.claudeHaiku
  return (usage.inputTokens / 1_000_000) * p.inputPerM + (usage.outputTokens / 1_000_000) * p.outputPerM
}

export function estimateDeepgramCostUsd(durationSeconds: number): number {
  return (durationSeconds / 60) * PRICING.deepgram.perMinuteUsd
}

export function estimateElevenLabsCostUsd(characters: number): number {
  return (characters / 1000) * PRICING.elevenlabs.per1kCharsUsd
}

export function estimateTwilioCostUsd(totalDurationSeconds: number): number {
  return (totalDurationSeconds / 60) * PRICING.twilio.perMinuteUsd
}

export function estimateWhatsappCostUsd(outboundMessageCount: number): number {
  return outboundMessageCount * PRICING.whatsapp.perOutboundMessageUsd
}
