import { api } from "./api"

export type BlacklistFilters = {
  status?: "all" | "candidate" | "confirmed"
  search?: string
  minDebt?: string
  minDaysOverdue?: string
}

export function getBlacklist(filters: BlacklistFilters) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "all") params.set(key, value)
  })
  const qs = params.toString()
  return api(`/blacklist${qs ? `?${qs}` : ""}`)
}

export function updateBlacklistEntry(
  clientId: string,
  data: { blacklistStatus?: "none" | "candidate" | "confirmed"; blacklistReason?: string | null; blacklistAssignedTo?: string | null }
) {
  return api(`/blacklist/${clientId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function searchClients(search: string) {
  return api(`/clients?search=${encodeURIComponent(search)}&limit=10`).then((data) => data.clients)
}
