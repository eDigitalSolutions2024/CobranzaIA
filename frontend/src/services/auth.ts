import { api } from "./api"

export const login = (email: string, password: string) =>
  api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })

export const getMe = () => api("/auth/me")
