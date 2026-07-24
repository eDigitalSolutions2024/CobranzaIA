import { clearSession, getToken } from "./authStorage"

const API_URL = "http://localhost:3002/api"

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleUnauthorized() {
  clearSession()
  window.location.reload()
}

export async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })

  if (res.status === 401) {
    handleUnauthorized()
    throw new Error("Session expired")
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.message || "Error API")
  }

  return data
}

export async function apiUpload(path: string, formData: FormData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  })

  if (res.status === 401) {
    handleUnauthorized()
    throw new Error("Session expired")
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.message || "Error uploading the file")
  }

  return data
}

export async function apiDownload(path: string, fallbackFilename: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: authHeaders(),
  })

  if (res.status === 401) {
    handleUnauthorized()
    throw new Error("Session expired")
  }

  if (!res.ok) {
    throw new Error("Error downloading the file")
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
