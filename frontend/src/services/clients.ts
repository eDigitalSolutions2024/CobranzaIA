import { api } from "./api"

export const getClients = () =>
  api("/clients").then((data) => data.clients)

export const getClientDetail = (id: string) =>
  api(`/clients/${id}/detail`)

export const createClient = (data: any) =>
  api("/clients", {
    method: "POST",
    body: JSON.stringify(data),
  })