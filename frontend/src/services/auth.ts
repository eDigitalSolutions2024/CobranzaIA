import { api } from "./api"

export const login = (email: string, password: string) =>
  api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuthRedirect: true,
  })

export const getMe = () => api("/auth/me")

export const logoutAll = () => api("/auth/logout-all", { method: "POST" })

export const getAuditLog = (limit = 50) => api(`/auth/audit-log?limit=${limit}`)
