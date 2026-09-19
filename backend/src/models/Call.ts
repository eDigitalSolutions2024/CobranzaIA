import mongoose, { Schema, Document } from 'mongoose'

export interface ICallTranscript {
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
  // Milisegundos desde que arrancó la llamada hasta este mensaje — para ubicarlo en la
  // línea de tiempo del flujo (ver voiceStream.controller.ts).
  elapsedMs?: number
  // Milisegundos que tardó en EMPEZAR este turno desde que terminó el turno anterior —
  // para 'assistant' es cuánto tardó la IA en contestar; para 'user' es cuánto tardó el
  // cliente en responder.
  latencyMs?: number
  // Solo 'assistant': milisegundos que duró el audio de este mensaje (cuánto tardó la
  // IA en decir/enviar el mensaje completo).
  durationMs?: number
}

export interface ICallFunctionLog {
  name: string
  timestamp: Date
  // Milisegundos desde que arrancó la llamada — en qué momento exacto del flujo se
  // disparó esta función.
  elapsedMs: number
}

export interface IOpenAIUsage {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  inputTextTokens: number
  inputAudioTokens: number
  outputTextTokens: number
  outputAudioTokens: number
  responseCount: number
}

export interface IClaudeUsage {
  inputTokens: number
  outputTokens: number
}

export interface ICall extends Document {
  phone: string
  clientId?: mongoose.Types.ObjectId
  transcript: ICallTranscript[]
  status: 'in_progress' | 'completed' | 'failed' | 'requires_human'
  promiseDate?: Date
  amount?: number
  requiresHuman: boolean
  identityConfirmed: boolean
  callSid: string
  // Si la disparó el botón "Call" del dashboard o el scheduler de llamadas automáticas
  // (ver autoCallScheduler.service.ts) — determina si el resultado de la llamada avanza
  // el ciclo automático del cliente (voice.controller.ts, advanceAutoCallCycle).
  triggeredBy: 'manual' | 'auto'
  flowStateId?: string | null
  flowContext?: Record<string, any>
  summary?: string | null
  // Nombres de las VOICE_TOOLS que el agente invocó durante la llamada, en orden —
  // sirve para derivar `disposition` al terminar sin depender de una IA adicional
  // (ver voiceStream.controller.ts y voice.controller.ts).
  calledFunctions: string[]
  // Detalle con timestamp/elapsedMs de cada llamada a función, para mostrar en el modal
  // de la llamada en qué momento exacto del flujo ocurrió cada una (ver calledFunctions
  // de arriba, que se mantiene igual — solo strings — porque computeVoiceDisposition en
  // voice.controller.ts depende de ese formato).
  functionCallLog: ICallFunctionLog[]
  // Clasificación final de la llamada (catálogo fijo, ver config/disposition.ts) y
  // la acción sugerida que resulta de ella — se copia también a Client.nextAction.
  disposition?: string | null
  nextAction?: string | null
  // Grabación de la llamada en Twilio — se pide al crearla (outbound) o justo al
  // contestar (inbound, ver handleIncoming) y se guarda cuando llega el statusCallback
  // de la grabación (RecordingStatus:completed). El audio real se sirve a través de
  // GET /api/voice/:id/recording (requireAuth) — nunca se expone la URL de Twilio ni las
  // credenciales directo al frontend.
  recordingSid?: string | null
  // Duración reportada por Twilio en el statusCallback final (CallDuration, en segundos) —
  // null hasta que la llamada termina y Twilio manda el webhook 'completed'.
  durationSeconds?: number | null
  // Tokens consumidos en OpenAI Realtime API, acumulados de todas las respuestas de la
  // llamada (ver openaiRealtime.service.ts / voiceStream.controller.ts).
  openaiUsage: IOpenAIUsage
  // Tokens de Claude Haiku usados en el resumen post-llamada (analyzeCallTranscript).
  claudeUsage: IClaudeUsage
  createdAt: Date
  updatedAt: Date
}

const CallSchema = new Schema<ICall>(
  {
    phone: { type: String, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    transcript: [
      {
        role: { type: String, enum: ['assistant', 'user'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        elapsedMs: { type: Number, default: null },
        latencyMs: { type: Number, default: null },
        durationMs: { type: Number, default: null },
      },
    ],
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'failed', 'requires_human'],
      default: 'in_progress',
    },
    promiseDate: { type: Date, default: null },
    amount: { type: Number, default: null },
    requiresHuman: { type: Boolean, default: false },
    identityConfirmed: { type: Boolean, default: false },
    callSid: { type: String, required: true, unique: true },
    triggeredBy: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    // Estado y variables de la máquina de estados (backend/src/flows/cobranza_ai_v1.json)
    flowStateId: { type: String, default: null },
    flowContext: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, default: null },
    calledFunctions: { type: [String], default: [] },
    functionCallLog: [
      {
        name: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        elapsedMs: { type: Number, required: true },
      },
    ],
    disposition: { type: String, default: null },
    recordingSid: { type: String, default: null },
    nextAction: { type: String, default: null },
    durationSeconds: { type: Number, default: null },
    openaiUsage: {
      totalTokens: { type: Number, default: 0 },
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      inputTextTokens: { type: Number, default: 0 },
      inputAudioTokens: { type: Number, default: 0 },
      outputTextTokens: { type: Number, default: 0 },
      outputAudioTokens: { type: Number, default: 0 },
      responseCount: { type: Number, default: 0 },
    },
    claudeUsage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
)

CallSchema.index({ phone: 1 })
CallSchema.index({ createdAt: -1 })
CallSchema.index({ clientId: 1, createdAt: -1 })
CallSchema.index({ status: 1 })

export default mongoose.model<ICall>('Call', CallSchema)
