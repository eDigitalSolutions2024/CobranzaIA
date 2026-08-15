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

export const PRICING = {
  // OpenAI Realtime API (modelo de voz en vivo) — precio de lista por millón de tokens.
  // El audio se cobra a una tarifa muy distinta (más cara) que el texto, por eso van
  // separados. Verificar contra https://openai.com/api/pricing antes de confiar en el
  // estimado para reportes financieros.
  openaiRealtime: {
    textInputPerM: envFloat('PRICING_OPENAI_REALTIME_TEXT_INPUT_PER_M', 4),
    textOutputPerM: envFloat('PRICING_OPENAI_REALTIME_TEXT_OUTPUT_PER_M', 16),
    audioInputPerM: envFloat('PRICING_OPENAI_REALTIME_AUDIO_INPUT_PER_M', 32),
    audioOutputPerM: envFloat('PRICING_OPENAI_REALTIME_AUDIO_OUTPUT_PER_M', 64),
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

export function estimateTwilioCostUsd(totalDurationSeconds: number): number {
  return (totalDurationSeconds / 60) * PRICING.twilio.perMinuteUsd
}

export function estimateWhatsappCostUsd(outboundMessageCount: number): number {
  return outboundMessageCount * PRICING.whatsapp.perOutboundMessageUsd
}
