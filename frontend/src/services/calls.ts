import { api, apiDownload } from "./api"

export type CallReportFilters = {
  status?: string
  search?: string
  country?: string
  collectorId?: string
  team?: string
  teamLeader?: string
  collector?: string
}

function toQueryString(filters: CallReportFilters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "all") params.set(key, value)
  })
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

// Última página de llamadas (100 más recientes) con el estado y los filtros pedidos
export const getCalls = (filters: CallReportFilters = {}) => api(`/calls${toQueryString(filters)}`)

export type CallCounts = { all: number; in_progress: number; completed: number; requires_human: number; failed: number }

// Cuántas llamadas hay por estado con los filtros activos (sin el estado, que se ignora)
export const getCallCounts = (filters: CallReportFilters = {}): Promise<CallCounts> =>
  api(`/calls/counts${toQueryString({ ...filters, status: undefined })}`)

export const exportCallsExcel = (filters: CallReportFilters) =>
  apiDownload(`/calls/export${toQueryString(filters)}`, `cobranzaia-calls-${new Date().toISOString().slice(0, 10)}.xlsx`)
