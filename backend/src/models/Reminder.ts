import mongoose, { Schema, Document } from 'mongoose'

export interface IReminder extends Document {
  clientId: mongoose.Types.ObjectId
  callId?: mongoose.Types.ObjectId
  channel: 'whatsapp'
  remindAt: Date
  message: string
  status: 'pending' | 'sent' | 'failed'
  createdAt: Date
  updatedAt: Date
}

const ReminderSchema = new Schema<IReminder>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    callId: { type: Schema.Types.ObjectId, ref: 'Call', default: null },
    channel: { type: String, enum: ['whatsapp'], default: 'whatsapp' },
    remindAt: { type: Date, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  },
  { timestamps: true }
)

ReminderSchema.index({ status: 1, remindAt: 1 })

export default mongoose.model<IReminder>('Reminder', ReminderSchema)
