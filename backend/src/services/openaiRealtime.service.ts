import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { OPENAI_API_KEY, OPENAI_REALTIME_MODEL, OPENAI_REALTIME_VOICE } from '../config/openai'
import { VOICE_TOOLS } from './voiceConversation.service'

export interface RealtimeFunctionCall {
  name: string
  callId: string
  arguments: string
}

// Desglose de tokens de una sola respuesta (evento response.done → response.usage) —
// audio y texto se facturan a tarifas distintas, por eso se reportan separados y no
// solo el total (ver config/pricing.ts).
export interface RealtimeUsage {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  inputTextTokens: number
  inputAudioTokens: number
  outputTextTokens: number
  outputAudioTokens: number
}

export interface RealtimeSessionEvents {
  audio: (base64Payload: string) => void
  // Lo que transcribió el micrófono del cliente (solo para bitácora/CRM).
  userTranscript: (text: string) => void
  // Lo que el modelo mismo dijo en voz — ya no se parsean marcadores de texto aquí,
  // las acciones de negocio se disparan vía function calling (ver evento functionCall).
  agentTranscript: (text: string) => void
  // El modelo decidió invocar una de las tools de VOICE_TOOLS.
  functionCall: (call: RealtimeFunctionCall) => void
  speechStarted: () => void
  // responseId permite distinguir DE CUÁL respuesta es este responseDone — necesario para
  // no colgar la llamada con el responseDone de una respuesta vieja cuando acabamos de
  // disparar una respuesta nueva (ej. la despedida tras requerir_humano/finalizar_llamada).
  responseCreated: (responseId: string) => void
  // usage viene null si esa respuesta no trajo bloque de uso (no debería pasar en la
  // práctica, pero el evento no lo garantiza formalmente).
  responseDone: (status: string, responseId: string, usage: RealtimeUsage | null) => void
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
            tools: VOICE_TOOLS,
            tool_choice: 'auto',
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
                // Historial: se probó server_vad con silence_duration_ms en 700ms (cortaba
                // al cliente a media frase, sin darle tiempo de pensar), luego 5000ms
                // (nunca se lograba ese silencio "perfecto" en una llamada real con ruido
                // de línea/respiración, así que el turno no cerraba y la llamada se
                // congelaba), luego 1500ms (funcional pero seguía siendo silencio puro —
                // no distingue "terminé de hablar" de "hice una pausa para pensar").
                //
                // semantic_vad reemplaza esa medición ciega de silencio por un clasificador
                // que entiende si la frase ya quedó completa semánticamente ("sí, el
                // miércoles diecinueve" → responde casi de inmediato) o quedó a medias
                // ("pues a mediados de..." → espera más aunque haya silencio) — más rápido
                // en los casos claros SIN heredar el riesgo de cortar al cliente que tenía
                // bajar silence_duration_ms a secas. eagerness:"medium" es el punto medio
                // (ni "high", que corta más agresivo si el clasificador se equivoca; ni
                // "low", que espera de más). Si tras probar en llamadas reales sigue
                // sintiéndose lento, subir a "high"; si empieza a interrumpir, bajar a "low".
                turn_detection: {
                  type: 'semantic_vad',
                  eagerness: 'medium',
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
      case 'response.created':
        if (event.response?.id) this.emit('responseCreated', event.response.id as string)
        break
      case 'response.output_item.done': {
        const item = event.item
        if (item?.type === 'function_call') {
          this.emit('functionCall', {
            name: item.name as string,
            callId: item.call_id as string,
            arguments: (item.arguments as string) ?? '{}',
          })
        }
        break
      }
      case 'response.done': {
        const status = event.response?.status ?? 'completed'
        if (status !== 'completed') {
          console.log(
            `[OpenAIRealtime] response.done status=${status} reason=${JSON.stringify(event.response?.status_details ?? null)}`
          )
        }
        this.emit('responseDone', status, (event.response?.id as string) ?? '', parseUsage(event.response?.usage))
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

  // Responde una function call con su resultado — obligatorio antes de que el modelo
  // pueda seguir la conversación con normalidad (ej. verify_payment corre en nuestro
  // backend, no dentro del modelo, así que el resultado se le regresa por aquí).
  sendFunctionCallOutput(callId: string, output: object): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output),
      },
    })
  }

  // Pide al modelo que continúe hablando después de recibir el resultado de una función
  // (ej. una vez que sabe si el pago existe o no, para poder reaccionar en voz).
  createResponse(): void {
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

// event.response.usage trae input_token_details/output_token_details con el desglose
// texto vs. audio — si algún campo falta (respuesta cancelada, por ejemplo) se toma como 0
// en vez de tronar.
function parseUsage(raw: any): RealtimeUsage | null {
  if (!raw) return null
  const inputDetails = raw.input_token_details ?? {}
  const outputDetails = raw.output_token_details ?? {}
  return {
    totalTokens: Number(raw.total_tokens) || 0,
    inputTokens: Number(raw.input_tokens) || 0,
    outputTokens: Number(raw.output_tokens) || 0,
    inputTextTokens: Number(inputDetails.text_tokens) || 0,
    inputAudioTokens: Number(inputDetails.audio_tokens) || 0,
    outputTextTokens: Number(outputDetails.text_tokens) || 0,
    outputAudioTokens: Number(outputDetails.audio_tokens) || 0,
  }
}
