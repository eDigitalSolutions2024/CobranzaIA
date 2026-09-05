// Catálogo fijo de disposición de llamada/conversación → siguiente acción.
// Se deriva de señales que YA existen en el flujo de voz (qué function tool
// disparó el agente) y de WhatsApp (outcome.type del guion) — no depende de
// que una IA "adivine" la categoría leyendo el texto, es una traducción
// determinística de una decisión que la IA ya tomó durante la llamada/chat.
export const STATUS_OPTIONS = [
  "No answer",
  "Voice mail",
  "Customer hung up",
  "Contact made - No resolution",
  "Follow up",
  "Payment scheduled",
  "Invoices received",
  "Extension required",
  "Invoice, statement or contract required",
  "Payment received",
  "Wrong number",
  "Email contact only",
  "Need invoice",
  "Phone number updated",
  "Prefers CAS support",
] as const

export type DispositionStatus = (typeof STATUS_OPTIONS)[number]

export const NEXT_ACTION_BY_STATUS: Record<DispositionStatus, string> = {
  "No answer": "New Call",
  "Voice mail": "New Call",
  "Customer hung up": "New Call",
  "Contact made - No resolution": "New Call",
  "Follow up": "Admin response",
  "Payment scheduled": "Confirm payment",
  "Invoices received": "New Call",
  "Extension required": "New Call",
  "Invoice, statement or contract required": "Admin response",
  "Payment received": "Confirm payment",
  "Wrong number": "New Call",
  "Email contact only": "Collector review",
  "Need invoice": "Admin response",
  "Phone number updated": "New Call",
  "Prefers CAS support": "Collector review",
}

export function nextActionFor(status: DispositionStatus): string {
  return NEXT_ACTION_BY_STATUS[status]
}
