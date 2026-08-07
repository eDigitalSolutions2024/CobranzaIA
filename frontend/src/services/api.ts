import { clearSession, getToken } from "./authStorage"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002/api"

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message)
    this.name = "ApiError"
  }
}

type ApiOptions = RequestInit & {
  /**
   * Whether this call represents an authenticated request. Defaults to true.
   * Set to false for public endpoints (login, register, ...): a 401 there
   * means "rejected" (e.g. wrong credentials), never "your session expired".
   */
  auth?: boolean
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleUnauthorized() {
  clearSession()
  window.location.reload()
}

function buildHeaders(auth: boolean, extra?: HeadersInit): Record<string, string> {
  return {
    ...(auth ? authHeaders() : {}),
    ...(extra as Record<string, string> | undefined),
  }
}

// Single place that decides what a failed response means.
// A 401 only implies "the session died" on requests that carry auth;
// on public endpoints it's just a rejection (bad credentials, etc.).
function assertOk(res: Response, auth: boolean, data: unknown): void {
  if (res.ok) return

  if (res.status === 401 && auth) {
    handleUnauthorized()
    throw new ApiError(res.status, "Session expired", data)
  }

  const message = (data as { message?: string } | null)?.message
  throw new ApiError(res.status, message || "Error API", data)
}

export async function api(path: string, options: ApiOptions = {}) {
  const { auth = true, headers, ...rest } = options

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...buildHeaders(auth, headers),
    },
  })

  const data = await res.json().catch(() => null)
  assertOk(res, auth, data)

  return data
}

/** Convenience wrapper for endpoints that don't require (and shouldn't react to) a session. */
export function publicApi(path: string, options: RequestInit = {}) {
  return api(path, { ...options, auth: false })
}

export async function apiUpload(path: string, formData: FormData, options: { auth?: boolean } = {}) {
  const { auth = true } = options

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: buildHeaders(auth),
    body: formData,
  })

  const data = await res.json().catch(() => null)
  assertOk(res, auth, data)

  return data
}

export async function apiDownload(
  path: string,
  fallbackFilename: string,
  options: { auth?: boolean } = {}
) {
  const { auth = true } = options

  const res = await fetch(`${API_URL}${path}`, {
    headers: buildHeaders(auth),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    assertOk(res, auth, data)
  }

  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] || fallbackFilename

  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
