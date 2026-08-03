import { api } from "./api"

export const getExchangeRate = () => api("/settings/exchange-rate")

export const updateExchangeRate = (usdMxn: number, password: string) =>
  api("/settings/exchange-rate", {
    method: "PUT",
    body: JSON.stringify({ usdMxn, password }),
  })
