// Sesión de streaming hacia Deepgram (Nova-3) — recibe el mismo audio mulaw 8kHz que ya
// llega de Twilio (sin transcodificar) y regresa transcripciones + el evento de "el
// cliente empezó a hablar" (para el barge-in, ver voiceStreamCartesia.controller.ts).
//
// NOTA: esto es la primera vez que se integra Deepgram en el proyecto — el formato exacto
// de los mensajes puede necesitar ajustes menores en la primera llamada de prueba real
// (ver plan en C:\Users\test\.claude\plans\toasty-riding-floyd.md, sección "Verificación").
import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { DEEPGRAM_API_KEY } from '../config/voicePipeline'

export interface DeepgramSessionEvents {
  transcript: (text: string, isFinal: boolean) => void
  interim: (text: string) => void
  speechStarted: () => void
  error: (err: Error) => void
  close: () => void
}

export declare interface DeepgramSttSession {
  on<E extends keyof DeepgramSessionEvents>(event: E, listener: DeepgramSessionEvents[E]): this
  emit<E extends keyof DeepgramSessionEvents>(event: E, ...args: Parameters<DeepgramSessionEvents[E]>): boolean
}

export class DeepgramSttSession extends EventEmitter {
  private ws: WebSocket | null = null
  private finalBuffer = ''

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        model: 'nova-3',
        language: 'es',
        encoding: 'mulaw',
        sample_rate: '8000',
        channels: '1',
        punctuate: 'true',
        interim_results: 'true',
        // Cuánto silencio (ms) cuenta como "terminó de hablar" — mismo problema que
        // silence_duration_ms en openaiRealtime.service.ts (ahí se llegó a 1500ms tras
        // 3 iteraciones). Se arranca aquí con un valor conservador, se ajusta con
        // pruebas reales igual que allá.
        endpointing: '350',
        utterance_end_ms: '1000',
        vad_events: 'true',
        smart_format: 'true',
      })

      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
        headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      })
      this.ws = ws

      // Sin esto, una conexión que nunca abre ni falla (red bloqueada, servidor sin
      // responder) dejaba initialize() colgado en silencio — visto en la primera prueba
      // real de este piloto.
      const timeout = setTimeout(() => {
        const err = new Error('Timeout de 8s conectando a Deepgram')
        this.emit('error', err)
        reject(err)
      }, 8000)

      ws.on('open', () => {
        clearTimeout(timeout)
        console.log('[Deepgram] WebSocket abierto')
        resolve()
      })
      ws.on('message', (raw) => this.handleMessage(raw))
      // Respuesta HTTP distinta de 101 (ej. 401 por API key inválida, 400 por parámetros
      // no aceptados) — se muestra el status y el cuerpo, que dicen exactamente qué falló.
      ws.on('unexpected-response', (_req, res) => {
        clearTimeout(timeout)
        let body = ''
        res.on('data', (chunk) => (body += chunk.toString()))
        res.on('end', () => {
          const err = new Error(`Deepgram rechazó la conexión: HTTP ${res.statusCode} — ${body.slice(0, 300)}`)
          this.emit('error', err)
          reject(err)
        })
      })
      ws.on('error', (err) => {
        clearTimeout(timeout)
        const error = err instanceof Error ? err : new Error(String(err))
        this.emit('error', error)
        reject(error)
      })
      ws.on('close', (code, reason) => {
        console.log(`[Deepgram] WebSocket cerrado code=${code} reason=${reason?.toString() ?? ''}`)
        this.emit('close')
      })
    })
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let event: any
    try {
      event = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (event.type === 'SpeechStarted') {
      this.emit('speechStarted')
      return
    }

    // Deepgram entrega la frase en varios fragmentos is_final — si cada uno se tratara
    // como turno, el agente respondería a "Por ejemplo," sin esperar el resto. Se acumulan
    // y se emiten completos cuando Deepgram marca fin de frase (speech_final) o de
    // enunciado (UtteranceEnd).
    if (event.type === 'Results') {
      const text = String(event.channel?.alternatives?.[0]?.transcript ?? '').trim()
      if (!event.is_final && text) this.emit('interim', text)
      if (event.is_final && text) this.finalBuffer = this.finalBuffer ? `${this.finalBuffer} ${text}` : text
      if (event.speech_final) this.flushUtterance()
      return
    }

    if (event.type === 'UtteranceEnd') {
      this.flushUtterance()
    }
  }

  private flushUtterance(): void {
    const text = this.finalBuffer.trim()
    this.finalBuffer = ''
    if (text) this.emit('transcript', text, true)
  }

  // Twilio manda el audio como base64 mulaw dentro de un evento JSON — Deepgram quiere
  // el binario crudo directo como frame de WebSocket, no envuelto en JSON.
  appendAudio(base64Payload: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(Buffer.from(base64Payload, 'base64'))
    }
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }
}
