import mongoose, { Schema, Document } from 'mongoose'

// Interruptor global de llamadas automáticas (ver autoCallScheduler.service.ts) —
// documento único (no uno por usuario/moneda como ExchangeRate), se hace upsert sobre
// un _id fijo para no tener que andar buscando "el más reciente".
// Motor de voz que usan las llamadas AUTOMÁTICAS (autoCallScheduler.service.ts):
// 'openai' = Realtime API (voiceStream.controller.ts, el camino de siempre);
// 'elevenlabs' = Deepgram + Claude + ElevenLabs (voiceStreamCartesia.controller.ts).
// El botón "Call" manual siempre usa OpenAI; "Test ElevenLabs" siempre usa ElevenLabs.
export type VoiceEngine = 'openai' | 'elevenlabs'

// Qué guion usan las llamadas MANUALES (botón "Call" / "Test ElevenLabs"), para probar
// cada diagrama con cualquier cliente: 'auto' = según los días de atraso del cliente (lo
// mismo que las automáticas); 'preventive' = guion preventivo 0 días; 'overdue_1_30' =
// guion 1–30 días. Las llamadas automáticas SIEMPRE usan 'auto'. Ver
// buildVoiceSystemPrompt (ClientInfo.flowOverride).
export type ManualCallFlow = 'auto' | 'preventive' | 'overdue_1_30'

export interface IAutomationSettings extends Document {
  autoCallsEnabled: boolean
  voiceEngine: VoiceEngine
  manualCallFlow: ManualCallFlow
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
    voiceEngine: { type: String, enum: ['openai', 'elevenlabs'], default: 'openai' },
    manualCallFlow: { type: String, enum: ['auto', 'preventive', 'overdue_1_30'], default: 'auto' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export default mongoose.model<IAutomationSettings>('AutomationSettings', AutomationSettingsSchema)
