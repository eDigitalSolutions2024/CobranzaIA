// Sesión de streaming hacia Cartesia (Sonic) — manda texto y regresa chunks de audio
// mulaw 8kHz (mismo formato que Twilio necesita, sin transcodificar) conforme se van
// generando, para minimizar el tiempo hasta el primer audio (time-to-first-audio).
//
// NOTA: primera integración de Cartesia en el proyecto — el formato exacto del protocolo
// de WebSocket puede necesitar ajustes en la primera prueba real (ver plan en
// C:\Users\test\.claude\plans\toasty-riding-floyd.md, sección "Verificación").
import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { CARTESIA_API_KEY, CARTESIA_MODEL, CARTESIA_VOICE_ID } from '../config/voicePipeline'

const CARTESIA_VERSION = '2024-11-13'

export interface CartesiaSessionEvents {
  audio: (base64Payload: string, contextId: string) => void
  done: (contextId: string) => void
  error: (err: Error) => void
  close: () => void
}

export declare interface CartesiaTtsSession {
  on<E extends keyof CartesiaSessionEvents>(event: E, listener: CartesiaSessionEvents[E]): this
  emit<E extends keyof CartesiaSessionEvents>(event: E, ...args: Parameters<CartesiaSessionEvents[E]>): boolean
}

export class CartesiaTtsSession extends EventEmitter {
  private ws: WebSocket | null = null

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.cartesia.ai/tts/websocket?api_key=${encodeURIComponent(CARTESIA_API_KEY)}&cartesia_version=${CARTESIA_VERSION}`
      const ws = new WebSocket(url)
      this.ws = ws

      ws.on('open', () => resolve())
      ws.on('message', (raw) => this.handleMessage(raw))
      ws.on('error', (err) => {
        const error = err instanceof Error ? err : new Error(String(err))
        this.emit('error', error)
        reject(error)
      })
      ws.on('close', () => this.emit('close'))
    })
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let event: any
    try {
      event = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (event.type === 'chunk' && event.data) {
      this.emit('audio', String(event.data), String(event.context_id ?? ''))
    } else if (event.type === 'done') {
      this.emit('done', String(event.context_id ?? ''))
    } else if (event.type === 'error') {
      this.emit('error', new Error(event.error ?? 'Cartesia TTS error'))
    }
  }

  // Cada turno del agente usa su propio context_id — así un cancel() a medias (barge-in)
  // no se confunde con el siguiente turno.
  speak(text: string): string {
    const contextId = randomUUID()
    this.send({
      context_id: contextId,
      model_id: CARTESIA_MODEL,
      transcript: text,
      voice: { mode: 'id', id: CARTESIA_VOICE_ID },
      output_format: { container: 'raw', encoding: 'pcm_mulaw', sample_rate: 8000 },
      language: 'es',
    })
    return contextId
  }

  // Barge-in: el cliente empezó a hablar mientras el bot seguía generando/hablando —
  // corta la generación en curso del lado de Cartesia (independiente de que
  // voiceStreamCartesia.controller.ts también mande 'clear' a Twilio para vaciar lo que
  // ya se había encolado).
  cancel(contextId: string): void {
    this.send({ context_id: contextId, cancel: true })
  }

  private send(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }
}
