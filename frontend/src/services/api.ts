export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3003/api"

export async function api(path: string, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  })

  if (!res.ok) {
    throw new Error("Error API")
  }

  return res.json()
}