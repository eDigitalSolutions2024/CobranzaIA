import mongoose, { Schema, Document } from 'mongoose'

// Una tasa por moneda (MXN nunca se guarda aquí — es la moneda base, tasa 1 implícita).
// Antes este modelo solo guardaba un `usdMxn` fijo; se generalizó porque las facturas
// llegan en varias monedas de LatAm (USD, PEN, COP, CLP, etc.), no solo dólares.
export interface IExchangeRate extends Document {
  currencyCode: string
  // Cuántos pesos vale 1 unidad de currencyCode (ej. USD -> 17.5).
  rateToMxn: number
  updatedBy?: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const ExchangeRateSchema = new Schema<IExchangeRate>(
  {
    currencyCode: { type: String, required: true, uppercase: true, trim: true },
    rateToMxn: { type: Number, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

// Una sola tasa vigente por moneda — actualizar es un upsert sobre este índice, no
// crear un historial de documentos.
ExchangeRateSchema.index({ currencyCode: 1 }, { unique: true })

export default mongoose.model<IExchangeRate>('ExchangeRate', ExchangeRateSchema)
