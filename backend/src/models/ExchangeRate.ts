import mongoose, { Schema, Document } from 'mongoose'

export interface IExchangeRate extends Document {
  usdMxn: number
  updatedBy?: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const ExchangeRateSchema = new Schema<IExchangeRate>(
  {
    usdMxn: { type: Number, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export default mongoose.model<IExchangeRate>('ExchangeRate', ExchangeRateSchema)
