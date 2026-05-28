import { api } from "./api"

export const getClients = () =>
  api("/clients")

export const createClient = (data:any) =>
  api("/clients", {
    method: "POST",
    body: JSON.stringify(data)
  })