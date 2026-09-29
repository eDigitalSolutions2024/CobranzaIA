// Config del pipeline de voz PILOTO (Deepgram STT + Claude + TTS) — separado a propósito
// de config/openai.ts, que sigue siendo el camino de producción
// (voiceStream.controller.ts / autoCallScheduler.service.ts). Ver el plan en
// C:\Users\test\.claude\plans\toasty-riding-floyd.md para el porqué de este aislamiento.
//
// TTS: se planeó originalmente con Cartesia, pero su registro estaba fallando el día de
// la prueba — se cambió a ElevenLabs (la otra opción evaluada) para no perder el día.
// Las variables de Cartesia se dejan declaradas por si se retoma más adelante; hoy el
// controlador (voiceStreamCartesia.controller.ts) usa ElevenLabsTtsSession.
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? ''

export const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY ?? ''
export const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID ?? '846d6cb0-2301-48b6-9683-48f5618ea2f6'
export const CARTESIA_MODEL = process.env.CARTESIA_MODEL ?? 'sonic-3'

export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? ''
// Sin default a propósito — no hay forma de confirmar un voice_id real sin verlo en la
// cuenta del usuario. Se elige en elevenlabs.io/app/voice-library (filtrar por español)
// y se copia el ID de la voz al .env como ELEVENLABS_VOICE_ID.
export const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? ''
// eleven_flash_v2_5: el modelo de menor latencia de ElevenLabs (~75ms) — el más
// apropiado para una llamada en vivo, donde cada milisegundo de espera se nota.
export const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_flash_v2_5'

// Ajustes de la voz — los mismos controles de la página "De texto a voz" de ElevenLabs,
// para probar valores en llamadas reales cambiando solo el .env. Los defaults son los que
// el sistema usaba antes de volverlos configurables (estabilidad 0.5, similitud 0.8,
// velocidad sin mandar = 1.0 normal). Un valor inválido o fuera de rango se ignora y se
// usa el default, para que un error de dedo en el .env no rompa la voz de las llamadas.
function envNumber(name: string, min: number, max: number): number | null {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) {
    console.warn(`[VoicePipeline] ${name}="${raw}" fuera de rango (${min}–${max}) — se usa el valor por defecto.`)
    return null
  }
  return value
}
export const ELEVENLABS_STABILITY = envNumber('ELEVENLABS_STABILITY', 0, 1) ?? 0.5
export const ELEVENLABS_SIMILARITY = envNumber('ELEVENLABS_SIMILARITY', 0, 1) ?? 0.8
// null = no se manda y ElevenLabs usa su velocidad normal (1.0). Rango permitido: 0.7–1.2.
export const ELEVENLABS_SPEED = envNumber('ELEVENLABS_SPEED', 0.7, 1.2)

export const CLAUDE_VOICE_MODEL = process.env.CLAUDE_VOICE_MODEL ?? 'claude-haiku-4-5-20251001'

export function validateVoicePipelineConfig(): void {
  const missing = [
    !DEEPGRAM_API_KEY && 'DEEPGRAM_API_KEY',
    !ELEVENLABS_API_KEY && 'ELEVENLABS_API_KEY',
    !ELEVENLABS_VOICE_ID && 'ELEVENLABS_VOICE_ID',
  ].filter(Boolean)

  if (missing.length > 0) {
    console.warn(`[VoicePipeline] Piloto de voz sin activar — falta(n): ${missing.join(', ')}. La ruta /api/voice/incoming-cartesia no funcionará hasta configurarlas.`)
    return
  }
  console.log(
    `[VoicePipeline] Piloto de voz configurado (Deepgram + Claude + ElevenLabs). Voz: ${ELEVENLABS_VOICE_ID} · ` +
      `modelo ${ELEVENLABS_MODEL} · estabilidad ${ELEVENLABS_STABILITY} · similitud ${ELEVENLABS_SIMILARITY} · ` +
      `velocidad ${ELEVENLABS_SPEED ?? '1.0 (normal)'}`
  )
}
