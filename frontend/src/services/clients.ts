import { api, apiDownload, apiUpload } from "./api"

export const getClients = () =>
  api("/clients").then((data) => data.clients)

export const getClientDetail = (id: string) =>
  api(`/clients/${id}/detail`)

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

export const exportClientsExcel = () =>
  apiDownload("/clients/export", `cobranzaia-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`)

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
