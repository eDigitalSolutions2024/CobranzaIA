import { api, apiDownload, apiUpload } from "./api"
import type { ReportFilterValue } from "../components/ReportFilters"

// Sin sort: el orden de siempre (más recientes primero)
export type ClientSort = "debt_desc" | "debt_asc" | "name_asc" | "name_desc"

export type ClientsPage = { clients: any[]; total: number; page: number; pages: number }

// Una página de la tabla de clientes (el servidor ordena y corta, ver getClients en el
// backend) — la tabla de Customer y el dashboard usan esta para poder recorrer TODOS los
// clientes. `filters` son los 5 filtros de reporte (country, collector, team...).
export const getClientsPage = (
  sort: ClientSort | "recent",
  page: number,
  limit: number,
  filters?: ReportFilterValue
): Promise<ClientsPage> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (sort !== "recent") params.set("sort", sort)
  if (filters) Object.entries(filters).forEach(([key, value]) => value && params.set(key, String(value)))
  return api(`/clients?${params.toString()}`)
}

// TODOS los clientes, recorriendo las páginas del servidor (que topa en 200 por petición):
// para pantallas que necesitan la lista completa (p. ej. el selector de Messages), sin
// depender de cuántos clientes haya.
export async function getClients(sort: ClientSort | "recent" = "recent"): Promise<any[]> {
  const first = await getClientsPage(sort, 1, 200)
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.pages - 1) }, (_, i) => getClientsPage(sort, i + 2, 200))
  )
  return [first, ...rest].flatMap((p) => p.clients)
}

export const getClientDetail = (id: string) =>
  api(`/clients/${id}/detail`)

export type ClientFilterOptions = {
  country: string[]
  collectorId: (string | number)[]
  team: string[]
  teamLeader: string[]
  collector: string[]
}

export const getClientFilterOptions = (): Promise<ClientFilterOptions> =>
  api("/clients/filter-options")

export const createClient = (data: any) =>
  api("/clients", {
    method: "POST",
    body: JSON.stringify(data),
  })

export const importClientsExcel = (file: File) => {
  const formData = new FormData()
  formData.append("file", file)
  return apiUpload("/clients/import", formData)
}

export const exportClientsExcel = (filters?: ReportFilterValue) => {
  const params = new URLSearchParams()
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
  }
  const qs = params.toString()
  return apiDownload(
    `/clients/export${qs ? `?${qs}` : ""}`,
    `cobranzaia-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`
  )
}

export const downloadClientsTemplate = () =>
  apiDownload("/clients/import-template", "plantilla-clientes.xlsx")

export const updateClient = (id: string, data: any) =>
  api(`/clients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })

export const deleteClient = (id: string) =>
  api(`/clients/${id}`, { method: "DELETE" })

export const createInvoice = (clientId: string, data: any) =>
  api(`/clients/${clientId}/invoices`, {
    method: "POST",
    body: JSON.stringify(data),
  })

export const updateInvoice = (invoiceId: string, data: any) =>
  api(`/invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })

export const deleteInvoice = (invoiceId: string) =>
  api(`/invoices/${invoiceId}`, { method: "DELETE" })

export const importInvoicesExcel = (file: File) => {
  const formData = new FormData()
  formData.append("file", file)
  return apiUpload("/invoices/import", formData)
}
