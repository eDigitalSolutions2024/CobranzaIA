import { api } from "./api"

export const getExchangeRates = (): Promise<{ currencyCode: string; rateToMxn: number; updatedAt: string }[]> =>
  api("/settings/exchange-rates")

export const updateExchangeRate = (currencyCode: string, rateToMxn: number, password: string) =>
  api("/settings/exchange-rates", {
    method: "PUT",
    body: JSON.stringify({ currencyCode, rateToMxn, password }),
  })

export type VoiceEngine = "openai" | "elevenlabs"

// Guion de las llamadas manuales: "auto" = según días de atraso del cliente
export type ManualCallFlow = "auto" | "preventive" | "overdue_1_30"

export const getAutomationSettings = (): Promise<{
  autoCallsEnabled: boolean
  voiceEngine: VoiceEngine
  manualCallFlow: ManualCallFlow
  autoCycleSteps?: number
}> => api("/settings/automation")

export const updateManualCallFlow = (manualCallFlow: ManualCallFlow): Promise<{ manualCallFlow: ManualCallFlow }> =>
  api("/settings/manual-call-flow", {
    method: "PUT",
    body: JSON.stringify({ manualCallFlow }),
  })

export const updateAutomationSettings = (autoCallsEnabled: boolean, password: string) =>
  api("/settings/automation", {
    method: "PUT",
    body: JSON.stringify({ autoCallsEnabled, password }),
  })

export const updateVoiceEngine = (voiceEngine: VoiceEngine, password: string) =>
  api("/settings/automation", {
    method: "PUT",
    body: JSON.stringify({ voiceEngine, password }),
  })
