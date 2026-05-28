import { api } from "./api"

export const getMetrics = () => api("/metrics")
