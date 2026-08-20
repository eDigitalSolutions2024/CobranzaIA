import { api } from "./api"

export const getUsage = (days: number | "all" | "today" = 30) => api(`/usage?days=${days}`)
