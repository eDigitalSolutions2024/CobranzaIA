// Genera tonos DTMF (los de las teclas del teléfono) en el formato del stream de Twilio:
// audio mu-law de 8 kHz, en base64. Twilio Media Streams no tiene un evento para "presionar
// una tecla", pero un tono DTMF es solo audio — el menú que escucha la llamada lo detecta igual
// que si saliera de un teléfono. Ver marcar_digito en voiceStreamCartesia.controller.ts.

const SAMPLE_RATE = 8000
const TONE_MS = 200 // duración de cada tecla (los menús suelen pedir 40-250 ms)
const GAP_MS = 120 // silencio entre teclas
const AMPLITUDE = 0.3 // por frecuencia; el pico de la suma es 0.6 de la escala completa
export const FRAME_BYTES = 160 // 20 ms de audio mu-law a 8 kHz

// Cada tecla = una frecuencia de la fila + una de la columna
const ROWS = [697, 770, 852, 941]
const COLS = [1209, 1336, 1477, 1633]
const KEYS: Record<string, [number, number]> = {
  '1': [ROWS[0], COLS[0]], '2': [ROWS[0], COLS[1]], '3': [ROWS[0], COLS[2]],
  '4': [ROWS[1], COLS[0]], '5': [ROWS[1], COLS[1]], '6': [ROWS[1], COLS[2]],
  '7': [ROWS[2], COLS[0]], '8': [ROWS[2], COLS[1]], '9': [ROWS[2], COLS[2]],
  '*': [ROWS[3], COLS[0]], '0': [ROWS[3], COLS[1]], '#': [ROWS[3], COLS[2]],
}

// PCM lineal de 16 bits -> mu-law (G.711)
export function linearToMulaw(sample: number): number {
  const BIAS = 0x84
  const CLIP = 32635
  let s = Math.max(-32768, Math.min(32767, Math.round(sample)))
  const sign = s < 0 ? 0x80 : 0
  if (s < 0) s = -s
  if (s > CLIP) s = CLIP
  s += BIAS
  let exponent = 7
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--
  const mantissa = (s >> (exponent + 3)) & 0x0f
  return ~(sign | (exponent << 4) | mantissa) & 0xff
}

// Deja solo teclas válidas (0-9, *, #) y máximo 4
export function sanitizeDigits(raw: unknown): string {
  return String(raw ?? '').replace(/[^0-9*#]/g, '').slice(0, 4)
}

// Audio mu-law completo (tonos + silencios) para las teclas pedidas
export function dtmfAudio(digits: string): Buffer {
  const toneSamples = Math.round((SAMPLE_RATE * TONE_MS) / 1000)
  const gapSamples = Math.round((SAMPLE_RATE * GAP_MS) / 1000)
  const bytes: number[] = []
  for (const key of digits) {
    const pair = KEYS[key]
    if (!pair) continue
    for (let i = 0; i < toneSamples; i++) {
      const t = i / SAMPLE_RATE
      const v = AMPLITUDE * (Math.sin(2 * Math.PI * pair[0] * t) + Math.sin(2 * Math.PI * pair[1] * t))
      bytes.push(linearToMulaw(v * 32767))
    }
    for (let i = 0; i < gapSamples; i++) bytes.push(0xff) // 0xff = silencio en mu-law
  }
  return Buffer.from(bytes)
}

// Tramos de 20 ms en base64, listos para mandarse como eventos "media" a Twilio
export function dtmfFrames(digits: string): string[] {
  const audio = dtmfAudio(digits)
  const frames: string[] = []
  for (let i = 0; i < audio.length; i += FRAME_BYTES) {
    const frame = Buffer.alloc(FRAME_BYTES, 0xff)
    audio.copy(frame, 0, i, Math.min(i + FRAME_BYTES, audio.length))
    frames.push(frame.toString('base64'))
  }
  return frames
}
