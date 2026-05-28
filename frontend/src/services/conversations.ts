import { api } from "./api"

export const getConversations = () => api("/conversations")

export const getConversationMessages = (id: string) =>
  api(`/conversations/${id}/messages`)

export const markConversationRead = (id: string) =>
  api(`/conversations/${id}/read`, { method: "PATCH" })
