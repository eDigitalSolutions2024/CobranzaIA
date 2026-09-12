import { clearSession, getToken } from "./authStorage"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3003/api"

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleUnauthorized() {
  clearSession()
  window.location.reload()
}

// skipAuthRedirect: para peticiones donde un 401 NO significa "tu sesión expiró"
// (ej. login con credenciales incorrectas en un intento nuevo, sin sesión previa) —
// sin esto, cualquier 401 recargaba la página entera y borraba lo que el usuario
// ya había escrito en el formulario.
export async function api(path: string, options: RequestInit & { skipAuthRedirect?: boolean } = {}) {
  const { skipAuthRedirect, ...fetchOptions } = options
  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })

  if (res.status === 401 && !skipAuthRedirect) {
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

// Para reproducir un archivo protegido (ej. audio de una grabación de llamada) en un
// <audio>/<video> — a diferencia de apiDownload, no dispara una descarga, solo regresa
// una URL de blob que se puede usar como src. Quien la llama es responsable de hacer
// URL.revokeObjectURL cuando ya no la necesite (ej. al desmontar o cambiar de llamada).
export async function apiBlobUrl(path: string): Promise<string> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: authHeaders(),
  })

  if (res.status === 401) {
    handleUnauthorized()
    throw new Error("Session expired")
  }

  if (!res.ok) {
    throw new Error("Error loading the file")
  }

  const blob = await res.blob()
  return window.URL.createObjectURL(blob)
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
