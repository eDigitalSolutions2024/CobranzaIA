import { api, apiDownload } from "./api"

export type CallReportFilters = {
  status?: string
  search?: string
  country?: string
  collectorId?: string
  team?: string
  teamLeader?: string
  collector?: string
  // Filtros propios de la llamada (ver buildCallExtraFilter en el backend)
  disposition?: string
  promise?: string // "yes" | "no"
  type?: string // "auto" | "manual"
  from?: string // AAAA-MM-DD
  to?: string
  page?: number
}

function toQueryString(filters: CallReportFilters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") params.set(key, String(value))
  })
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

// Una página (100 llamadas, más recientes primero) con el estado y los filtros pedidos
export const getCalls = (filters: CallReportFilters = {}) => api(`/calls${toQueryString(filters)}`)

export type CallCounts = { all: number; in_progress: number; completed: number; requires_human: number; failed: number }

// Cuántas llamadas hay por estado con los filtros activos (sin el estado ni la página, que se ignoran)
export const getCallCounts = (filters: CallReportFilters = {}): Promise<CallCounts> =>
  api(`/calls/counts${toQueryString({ ...filters, status: undefined, page: undefined })}`)

export const exportCallsExcel = (filters: CallReportFilters) =>
  apiDownload(`/calls/export${toQueryString({ ...filters, page: undefined })}`, `cobranzaia-calls-${new Date().toISOString().slice(0, 10)}.xlsx`)
