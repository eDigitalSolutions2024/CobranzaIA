import { api } from "./api"

export type AuditPreview = {
  matching: number // llamadas que cumplen el filtro
  withPayment: number // de esas, las que hablan de pago
  alreadyReviewed: number
  callIds: string[] // las que se van a analizar
  truncated: boolean
}

// Llamadas que se mandan a analizar por petición (el servidor acepta máximo 5)
export const AUDIT_BATCH = 5

export const previewPaymentAudit = (filters: { dispositions: string; from: string; to: string; includeReviewed: boolean }): Promise<AuditPreview> =>
  api("/payment-audit/preview", { method: "POST", body: JSON.stringify(filters) })

export const analyzePaymentAudit = (callIds: string[]): Promise<{ analyzed: number; found: number; failed: number }> =>
  api("/payment-audit/analyze", { method: "POST", body: JSON.stringify({ callIds }) })

export const getPaymentAuditFindings = (): Promise<{ findings: any[]; total: number }> => api("/payment-audit/findings")

export const confirmPaymentFinding = (callId: string, data: { date?: string; amount?: number }) =>
  api(`/payment-audit/${callId}/confirm`, { method: "POST", body: JSON.stringify(data) })

export const dismissPaymentFinding = (callId: string) => api(`/payment-audit/${callId}/dismiss`, { method: "POST" })
