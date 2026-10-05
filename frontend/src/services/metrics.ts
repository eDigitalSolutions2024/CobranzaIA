import { api } from "./api"
import type { ReportFilterValue } from "../components/ReportFilters"

export const getMetrics = (filters?: ReportFilterValue) => {
  const params = new URLSearchParams()
  if (filters) Object.entries(filters).forEach(([key, value]) => value && params.set(key, String(value)))
  const qs = params.toString()
  return api(`/metrics${qs ? `?${qs}` : ""}`)
}
