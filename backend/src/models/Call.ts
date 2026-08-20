import mongoose, { Schema, Document } from 'mongoose'

export interface ICallTranscript {
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
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
  flowStateId?: string | null
  flowContext?: Record<string, any>
  summary?: string | null
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
    // Estado y variables de la máquina de estados (backend/src/flows/cobranza_ai_v1.json)
    flowStateId: { type: String, default: null },
    flowContext: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, default: null },
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
