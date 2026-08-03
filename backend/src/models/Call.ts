import mongoose, { Schema, Document } from 'mongoose'

export interface ICallTranscript {
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
}

export interface ICall extends Document {
  phone: string
  clientId?: mongoose.Types.ObjectId
  transcript: ICallTranscript[]
  status: 'in_progress' | 'completed' | 'failed' | 'requires_human'
  promiseDate?: Date
  amount?: number
  requiresHuman: boolean
  callSid: string
  flowStateId?: string | null
  flowContext?: Record<string, any>
  summary?: string | null
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
    callSid: { type: String, required: true, unique: true },
    // Estado y variables de la máquina de estados (backend/src/flows/cobranza_ai_v1.json)
    flowStateId: { type: String, default: null },
    flowContext: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, default: null },
  },
  { timestamps: true }
)

CallSchema.index({ phone: 1 })
CallSchema.index({ createdAt: -1 })

export default mongoose.model<ICall>('Call', CallSchema)
