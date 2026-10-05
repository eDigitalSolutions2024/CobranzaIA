import type ExcelJS from "exceljs"

// Columnas de los reportes de Excel, en inglés — compartidas por GET /clients/export y
// GET /calls/export para que las dos descargas muestren exactamente la misma información
// del cliente y de la llamada, con los mismos nombres.

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  contacted: "Contacted",
  negotiating: "Negotiating",
  promised: "Promise",
  paid: "Paid",
  no_response: "No response",
}

const RISK_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" }

const DOCUMENT_LABEL: Record<string, string> = {
  factura: "Invoice",
  contrato: "Contract",
  estado_de_cuenta: "Account statement",
}

const BLACKLIST_LABEL: Record<string, string> = { candidate: "Candidate", confirmed: "Confirmed" }

const CALL_STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  requires_human: "Requires agent",
}

const toDate = (value: unknown): Date | null => (value ? new Date(value as string) : null)
const yesNo = (value: unknown): string => (value ? "Yes" : "No")

// ─── Cliente ───────────────────────────────────────────────────────────────────────
export const CLIENT_EXPORT_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Country", key: "country", width: 12 },
  { header: "Customer ID", key: "customerId", width: 12 },
  { header: "Customer Name", key: "name", width: 25 },
  { header: "Phone", key: "phone", width: 15 },
  { header: "RFC", key: "rfc", width: 16 },
  { header: "Collector ID", key: "collectorId", width: 12 },
  { header: "Team", key: "team", width: 14 },
  { header: "Team Leader", key: "teamLeader", width: 16 },
  { header: "Collector", key: "collector", width: 16 },
  { header: "Invoice Number", key: "invoiceNumber", width: 16 },
  { header: "Create Date", key: "createDate", width: 16 },
  { header: "Due Date", key: "dueDate", width: 16 },
  { header: "Aging Days", key: "agingDays", width: 12 },
  { header: "Aging Target", key: "agingTarget", width: 12 },
  { header: "Loan/Lease", key: "loanLease", width: 12 },
  { header: "Debt", key: "debt", width: 12 },
  { header: "USD Amount", key: "usdAmount", width: 14 },
  { header: "Status", key: "status", width: 15 },
  { header: "AI Risk", key: "risk", width: 12 },
  { header: "Channel", key: "channel", width: 12 },
  { header: "Contact", key: "contact", width: 18 },
  { header: "Last Contact", key: "lastContactAt", width: 18 },
  { header: "Next Action", key: "nextAction", width: 18 },
  // Resultado de la última llamada y estados de intervención (mismas etiquetas que la
  // tabla de clientes: Classification, Conclusion Call, Needs agent, Needs admin...)
  { header: "Classification", key: "lastCallDisposition", width: 26 },
  { header: "Conclusion Call", key: "lastCallConclusion", width: 40 },
  { header: "Last Call Date", key: "lastCallAt", width: 18 },
  { header: "Needs Agent", key: "requiresHuman", width: 12 },
  { header: "Needs Agent Reason", key: "requiresHumanReason", width: 26 },
  { header: "Needs Admin", key: "needsAdmin", width: 12 },
  { header: "Requested Documents", key: "needsAdminDocuments", width: 22 },
  { header: "Needs Admin Detail", key: "needsAdminDetail", width: 30 },
  { header: "Blacklist", key: "blacklistStatus", width: 12 },
  { header: "Blacklist Reason", key: "blacklistReason", width: 30 },
  { header: "Email Only", key: "emailOnly", width: 11 },
  { header: "Contact Email", key: "contactEmail", width: 26 },
  { header: "Excluded Until", key: "collectionExcludedUntil", width: 16 },
  { header: "Exclusion Reason", key: "collectionExclusionReason", width: 26 },
  { header: "Scheduled Callback", key: "scheduledCallbackAt", width: 18 },
  { header: "Payment Promise", key: "paymentPromiseAmount", width: 16 },
  { header: "Date Promise", key: "datePromise", width: 16 },
  { header: "Score", key: "score", width: 10 },
  { header: "Last Reply", key: "lastReplyAt", width: 18 },
  { header: "Last Intent", key: "lastIntent", width: 18 },
  { header: "Total Messages", key: "totalMessages", width: 14 },
  { header: "Total Replies", key: "totalReplies", width: 14 },
  { header: "Notes", key: "notes", width: 30 },
  { header: "Created At", key: "createdAt", width: 18 },
]

// Fila con los datos del cliente para las columnas de arriba. Sin cliente (ej. una
// llamada de un número no registrado) devuelve todo vacío.
export function toClientExportRow(c: any): Record<string, unknown> {
  if (!c) return {}
  const now = new Date()
  // La exclusión solo se muestra mientras está vigente (igual que el badge "Excluded"
  // de la tabla); una fecha ya pasada no significa nada para el cliente hoy.
  const excluded = c.collectionExcludedUntil && new Date(c.collectionExcludedUntil) > now
  return {
    country: c.country || "",
    customerId: c.customerId ?? "",
    name: c.name,
    phone: c.phone,
    rfc: c.rfc || "",
    collectorId: c.collectorId ?? "",
    team: c.team || "",
    teamLeader: c.teamLeader || "",
    collector: c.collector || "",
    invoiceNumber: c.invoiceNumber || "",
    createDate: toDate(c.createDate),
    dueDate: toDate(c.dueDate),
    agingDays: c.agingDays ?? "",
    agingTarget: c.agingTarget || "",
    loanLease: c.loanLease || "",
    debt: c.debt,
    usdAmount: c.usdAmount ?? "",
    status: STATUS_LABEL[c.status as string] || c.status,
    risk: RISK_LABEL[c.risk as string] || c.risk,
    channel: c.channel,
    contact: c.contact || "",
    lastContactAt: toDate(c.lastContactAt),
    nextAction: c.nextAction || "",
    lastCallDisposition: c.lastCallDisposition || "",
    lastCallConclusion: c.lastCallConclusion || "",
    lastCallAt: toDate(c.lastCallAt),
    requiresHuman: yesNo(c.requiresHuman),
    requiresHumanReason: c.requiresHuman ? c.requiresHumanReason || "" : "",
    needsAdmin: yesNo(c.needsAdmin),
    needsAdminDocuments: c.needsAdmin
      ? (c.needsAdminDocuments ?? []).map((d: string) => DOCUMENT_LABEL[d] || d).join(", ")
      : "",
    needsAdminDetail: c.needsAdmin ? c.needsAdminDetail || "" : "",
    blacklistStatus: BLACKLIST_LABEL[c.blacklistStatus as string] || "",
    blacklistReason: BLACKLIST_LABEL[c.blacklistStatus as string] ? c.blacklistReason || "" : "",
    emailOnly: yesNo(c.emailOnly),
    contactEmail: c.contactEmail || "",
    collectionExcludedUntil: excluded ? toDate(c.collectionExcludedUntil) : null,
    collectionExclusionReason: excluded ? c.collectionExclusionReason || "" : "",
    scheduledCallbackAt: toDate(c.scheduledCallbackAt),
    paymentPromiseAmount: c.paymentPromiseAmount ?? "",
    datePromise: toDate(c.datePromise),
    score: c.score,
    lastReplyAt: toDate(c.lastReplyAt),
    lastIntent: c.lastIntent || "",
    totalMessages: c.totalMessages,
    totalReplies: c.totalReplies,
    notes: c.notes || "",
    createdAt: toDate(c.createdAt),
  }
}

// ─── Llamada ───────────────────────────────────────────────────────────────────────
// Keys con prefijo call_ para no chocar con las del cliente cuando van en la misma fila
// (GET /calls/export). Sin las columnas viejas de monto/fecha de promesa de la llamada:
// el sistema ya no las llena (las promesas viven en el cliente: Payment Promise / Date
// Promise) y salían duplicadas.
export const CALL_EXPORT_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Dialed Phone", key: "call_phone", width: 15 },
  { header: "Call Date", key: "call_createdAt", width: 18 },
  { header: "Duration (min)", key: "call_durationMin", width: 14 },
  { header: "Call Type", key: "call_triggeredBy", width: 12 },
  { header: "Call Status", key: "call_status", width: 15 },
  { header: "Disposition", key: "call_disposition", width: 24 },
  { header: "Call Next Action", key: "call_nextAction", width: 18 },
  { header: "Escalated to Agent", key: "call_requiresHuman", width: 16 },
  { header: "Voicemail", key: "call_detectedVoicemail", width: 12 },
  { header: "Summary", key: "call_summary", width: 40 },
  { header: "Transcript", key: "call_transcript", width: 60 },
]

export function toCallExportRow(call: any, client?: any): Record<string, unknown> {
  const transcriptText = (call.transcript || [])
    .map((t: any) => `${t.role === "assistant" ? "AI" : "Customer"}: ${t.content}`)
    .join(" | ")
  return {
    call_phone: call.phone || client?.phone || "—",
    call_createdAt: toDate(call.createdAt),
    call_durationMin: call.durationSeconds != null ? Math.round((call.durationSeconds / 60) * 10) / 10 : "",
    call_triggeredBy: call.triggeredBy === "auto" ? "Automatic" : "Manual",
    call_status: CALL_STATUS_LABEL[call.status as string] || call.status,
    call_disposition: call.disposition || "",
    call_nextAction: call.nextAction || "",
    call_requiresHuman: yesNo(call.requiresHuman),
    call_detectedVoicemail: yesNo(call.detectedVoicemail),
    call_summary: call.summary || "",
    call_transcript: transcriptText,
  }
}
