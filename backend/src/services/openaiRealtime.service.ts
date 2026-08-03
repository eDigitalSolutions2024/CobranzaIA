import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { OPENAI_API_KEY, OPENAI_REALTIME_MODEL, OPENAI_REALTIME_VOICE } from '../config/openai'

export interface RealtimeSessionEvents {
  audio: (base64Payload: string) => void
  // Lo que transcribió el micrófono del cliente (solo para bitácora/CRM).
  userTranscript: (text: string) => void
  // Lo que el modelo mismo acaba de decir — de aquí se leen los marcadores
  // (PROMESA_PAGO, REQUIERE_HUMANO, etc.) que deciden las acciones de negocio.
  agentTranscript: (text: string) => void
  speechStarted: () => void
  responseDone: (status: string) => void
  error: (err: Error) => void
  close: () => void
}

export declare interface OpenAIRealtimeSession {
  on<E extends keyof RealtimeSessionEvents>(event: E, listener: RealtimeSessionEvents[E]): this
  emit<E extends keyof RealtimeSessionEvents>(event: E, ...args: Parameters<RealtimeSessionEvents[E]>): boolean
}

export class OpenAIRealtimeSession extends EventEmitter {
  private ws: WebSocket | null = null

  // El modelo conversa libre (a diferencia de la versión anterior, que lo forzaba a
  // recitar texto exacto) — turn_detection.create_response:true deja que responda solo
  // en cuanto detecta que el cliente terminó de hablar, como un agente humano real.
  connect(instructions: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      })
      this.ws = ws

      const onOpen = () => {
        this.send({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions,
            audio: {
              input: {
                format: { type: 'audio/pcmu' },
                // gpt-4o-transcribe alucina mucho menos que whisper-1 con audio
                // telefónico ruidoso (8kHz). "language" fija que la llamada es en
                // español.
                transcription: { model: 'gpt-4o-transcribe', language: 'es' },
                // Reduce ruido de línea telefónica. "near_field": el micrófono
                // (bocina del teléfono) está pegado a la boca del cliente.
                noise_reduction: { type: 'near_field' },
                // threshold más alto que el default (0.5): con create_response:true el
                // propio servidor decide cuándo interrumpir al agente usando este mismo
                // valor — en 0.5 se cortaba a media palabra con cualquier ruido/sonido
                // de fondo del cliente, no solo cuando de verdad quería tomar la palabra.
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.65,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 700,
                  create_response: true,
                },
              },
              output: {
                format: { type: 'audio/pcmu' },
                voice: OPENAI_REALTIME_VOICE,
              },
            },
          },
        })
      }

      const onMessage = (raw: WebSocket.RawData) => {
        let event: any
        try {
          event = JSON.parse(raw.toString())
        } catch {
          return
        }

        switch (event.type) {
          case 'session.updated':
            resolve()
            break
          case 'error':
            console.error('[OpenAIRealtime] error:', event.error)
            this.emit('error', new Error(event.error?.message ?? 'Realtime API error'))
            break
        }

        this.handleEvent(event)
      }

      ws.on('open', onOpen)
      ws.on('message', onMessage)

      ws.on('error', (err) => {
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
        reject(err instanceof Error ? err : new Error(String(err)))
      })

      ws.on('close', () => this.emit('close'))
    })
  }

  private handleEvent(event: any): void {
    switch (event.type) {
      case 'response.output_audio.delta':
        if (event.delta) this.emit('audio', event.delta as string)
        break
      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) this.emit('userTranscript', String(event.transcript).trim())
        break
      case 'response.output_audio_transcript.done':
        if (event.transcript) this.emit('agentTranscript', String(event.transcript).trim())
        break
      case 'input_audio_buffer.speech_started':
        this.emit('speechStarted')
        break
      case 'response.done': {
        const status = event.response?.status ?? 'completed'
        if (status !== 'completed') {
          console.log(
            `[OpenAIRealtime] response.done status=${status} reason=${JSON.stringify(event.response?.status_details ?? null)}`
          )
        }
        this.emit('responseDone', status)
        break
      }
      default:
        break
    }
  }

  private send(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  // El agente debe hablar primero al contestar la llamada (no esperar a que el
  // cliente diga algo) — dispara una respuesta guiada solo por session.instructions.
  triggerGreeting(): void {
    this.send({ type: 'response.create' })
  }

  // Inyecta un resultado de sistema (ej. "no se encontró el pago") a media conversación
  // para que el modelo lo incorpore de forma natural en su siguiente respuesta — necesario
  // para pasos como verify_payment, que corren en nuestro backend, no dentro del modelo.
  injectSystemNote(note: string): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: `[NOTA DEL SISTEMA — no es el cliente hablando: ${note}]` }],
      },
    })
    this.send({ type: 'response.create' })
  }

  appendAudio(base64Payload: string): void {
    this.send({ type: 'input_audio_buffer.append', audio: base64Payload })
  }

  cancelResponse(): void {
    this.send({ type: 'response.cancel' })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }
}
