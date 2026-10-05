import { api } from "./api"

export const getUsage = (days: number | "all" | "today" = 30) => api(`/usage?days=${days}`)

// Gasto real de Anthropic (API de administración) — ver anthropicBilling.service.ts en el backend
export const getAnthropicUsage = (days: number | "all" | "today" = 30) => api(`/usage/anthropic?days=${days}`)
