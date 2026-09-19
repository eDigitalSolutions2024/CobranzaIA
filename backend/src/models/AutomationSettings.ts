import mongoose, { Schema, Document } from 'mongoose'

// Interruptor global de llamadas automáticas (ver autoCallScheduler.service.ts) —
// documento único (no uno por usuario/moneda como ExchangeRate), se hace upsert sobre
// un _id fijo para no tener que andar buscando "el más reciente".
export interface IAutomationSettings extends Document {
  autoCallsEnabled: boolean
  updatedBy?: mongoose.Types.ObjectId | null
  updatedAt: Date
}

// Sin el genérico <IAutomationSettings> a propósito: Document tipa _id como ObjectId,
// pero aquí se usa un _id de texto fijo ('global') para el upsert del singleton — el
// genérico chocaría con eso. El tipado real lo da mongoose.model<IAutomationSettings> de
// abajo, que es lo que se usa en el resto del código.
const AutomationSettingsSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    autoCallsEnabled: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export default mongoose.model<IAutomationSettings>('AutomationSettings', AutomationSettingsSchema)
