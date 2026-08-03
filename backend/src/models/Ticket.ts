import mongoose, { Schema, Document } from 'mongoose'

export interface ITicket extends Document {
  clientId?: mongoose.Types.ObjectId | null
  callId?: mongoose.Types.ObjectId | null
  phone: string
  reason: string
  status: 'open' | 'closed'
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const TicketSchema = new Schema<ITicket>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    callId: { type: Schema.Types.ObjectId, ref: 'Call', default: null },
    phone: { type: String, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    notes: { type: String, default: null },
  },
  { timestamps: true }
)

TicketSchema.index({ status: 1, createdAt: -1 })

export default mongoose.model<ITicket>('Ticket', TicketSchema)
