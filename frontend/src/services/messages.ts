import { api } from "./api"

export const getMessages = (limit = 20) =>
  api(`/messages?limit=${limit}`)
