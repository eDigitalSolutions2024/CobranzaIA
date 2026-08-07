import { api, publicApi } from "./api"

export const login = (email: string, password: string) =>
  publicApi("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })

export const getMe = () => api("/auth/me")
