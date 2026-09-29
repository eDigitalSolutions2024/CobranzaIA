import mongoose from 'mongoose'
import Invoice from '../models/Invoice'

export interface InvoiceSummary {
  // Facturas abiertas (no pagadas ni canceladas) con fecha de vencimiento ya pasada.
  overdueCount: number
  // Días de atraso de la factura vencida más antigua — null si ninguna está vencida
  // (o si ninguna tiene dueDate capturado).
  oldestDaysOverdue: number | null
  // Facturas abiertas (vencidas o no) con su número y fecha de emisión, más antiguas
  // primero — para responder "¿a cuáles facturas corresponde?" con el mes y los números
  // (diagrama "Llamada preventiva al corriente", paso 2).
  openInvoices?: Array<{ number: string; issueDate: Date | null }>
  // Fecha de vencimiento de la factura vencida más antigua (la de oldestDaysOverdue) —
  // diagrama 1–30 días, paso 2: "su factura por $[Monto] venció el [Fecha]".
  oldestDueDate?: Date | null
}

// "Hoy" en hora de CDMX como día calendario (UTC medianoche) — las dueDate de factura
// son "solo día" guardadas en UTC (ver formatDate en ClientDetailModal.tsx), así que se
// comparan contra un día calendario, no contra el instante actual; si no, una factura
// que venció ayer podía contar 1 o 2 días según la hora a la que se llamara.
function todayMexicoCityUtc(): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [y, m, d] = parts.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Resume las facturas del cliente para que el agente de voz pueda explicar de qué
// facturas habla cuando el cliente pregunta (tarjeta "Agregar respuesta del Agente IA
// para aclaración de facturas vencidas al script de la llamada"). El monto NO se calcula
// aquí — se usa Client.debt (la misma cifra que el agente ya dice en el paso del saldo),
// para que nunca diga dos montos distintos en la misma llamada.
export async function loadInvoiceSummary(clientId: mongoose.Types.ObjectId | string): Promise<InvoiceSummary> {
  const open = await Invoice.find({
    clientId,
    status: { $nin: ['paid', 'cancelled'] },
    dueDate: { $ne: null },
  })
    .select('dueDate invoiceNumber issueDate')
    .sort({ dueDate: 1 })
    .lean()

  const today = todayMexicoCityUtc()
  const daysOverdue = open
    .map((inv) => Math.floor((today - new Date(inv.dueDate as Date).getTime()) / 86_400_000))
    .filter((days) => days > 0)
  // `open` viene ordenado por dueDate ascendente: la primera vencida es la más antigua.
  const oldestOverdue = open.find((inv) => Math.floor((today - new Date(inv.dueDate as Date).getTime()) / 86_400_000) > 0)

  return {
    oldestDueDate: oldestOverdue ? (oldestOverdue.dueDate as Date) : null,
    overdueCount: daysOverdue.length,
    oldestDaysOverdue: daysOverdue.length > 0 ? Math.max(...daysOverdue) : null,
    openInvoices: open
      .filter((inv) => inv.invoiceNumber)
      .map((inv) => ({ number: String(inv.invoiceNumber), issueDate: (inv.issueDate as Date | null) ?? null })),
  }
}
