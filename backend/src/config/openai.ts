export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
export const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime'
export const OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? 'marin'

export function validateOpenAIConfig(): void {
  if (!OPENAI_API_KEY) {
    console.warn('[OpenAI] ADVERTENCIA — falta OPENAI_API_KEY. El agente de voz no podrá contestar llamadas.')
    return
  }
  console.log(`[OpenAI] Configuración OK. Modelo Realtime: ${OPENAI_REALTIME_MODEL}, voz: ${OPENAI_REALTIME_VOICE}`)
}
