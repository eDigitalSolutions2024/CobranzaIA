import { api } from "./api"

export const getMessages = (limit = 20) =>
  api(`/messages?limit=${limit}`)

export const sendWhatsapp = (data: {
  clientId: string
  clientName: string
  phone: string
  debt: number
  channel: string
  template: string
}) =>
  api("/send-whatsapp", {
    method: "POST",
    body: JSON.stringify(data),
  })
