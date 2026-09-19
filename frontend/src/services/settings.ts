import { api } from "./api"

export const getExchangeRates = (): Promise<{ currencyCode: string; rateToMxn: number; updatedAt: string }[]> =>
  api("/settings/exchange-rates")

export const updateExchangeRate = (currencyCode: string, rateToMxn: number, password: string) =>
  api("/settings/exchange-rates", {
    method: "PUT",
    body: JSON.stringify({ currencyCode, rateToMxn, password }),
  })

export const getAutomationSettings = (): Promise<{ autoCallsEnabled: boolean }> =>
  api("/settings/automation")

export const updateAutomationSettings = (autoCallsEnabled: boolean, password: string) =>
  api("/settings/automation", {
    method: "PUT",
    body: JSON.stringify({ autoCallsEnabled, password }),
  })
