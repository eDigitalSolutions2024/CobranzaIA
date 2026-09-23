import { api, apiDownload } from "./api"

export async function getCalls() {
  return api("/calls")
}

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

export const exportCallsExcel = (filters: CallReportFilters) =>
  apiDownload(`/calls/export${toQueryString(filters)}`, `cobranzaia-llamadas-${new Date().toISOString().slice(0, 10)}.xlsx`)
