import { api } from "./api"
import type { ReportFilterValue } from "../components/ReportFilters"

export type BlacklistFilters = {
  status?: "all" | "candidate" | "confirmed"
  search?: string
  minDebt?: string
  minDaysOverdue?: string
}

export function getBlacklist(filters: BlacklistFilters & Partial<ReportFilterValue>) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "all") params.set(key, value)
  })
  const qs = params.toString()
  return api(`/blacklist${qs ? `?${qs}` : ""}`)
}

export function updateBlacklistEntry(
  clientId: string,
  data: { blacklistStatus?: "none" | "candidate" | "confirmed"; blacklistReason?: string | null; blacklistAssignedTo?: string | null }
) {
  return api(`/blacklist/${clientId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function searchClients(search: string) {
  return api(`/clients?search=${encodeURIComponent(search)}&limit=10`).then((data) => data.clients)
}

// Colas de clientes que necesitan a una persona (pestañas junto a la Blacklist)
export type AttentionQueue = "follow_up" | "needs_agent" | "needs_admin" | "collector" | "all"

export type AttentionResponse = {
  entries: any[]
  counts: Record<AttentionQueue | "blacklist", number>
  total: number // clientes que cumplen los filtros (todas las páginas)
  page: number
  pageSize: number
}

export function getAttentionQueue(
  filters: { queue: AttentionQueue; search?: string; minDaysOverdue?: string; page?: number } & Partial<ReportFilterValue>
): Promise<AttentionResponse> {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value))
  })
  return api(`/attention-queue?${params.toString()}`)
}

// El gestor ya atendió el caso (Needs agent / Collector Assistance): el cliente vuelve al ciclo automático
export const markClientHandled = (clientId: string) => api(`/clients/${clientId}/collector/release`, { method: "POST" })

// El administrador ya envió los documentos que el cliente pidió (Needs admin)
export const markDocumentsSent = (clientId: string) => api(`/clients/${clientId}/needs-admin/sent`, { method: "POST" })
