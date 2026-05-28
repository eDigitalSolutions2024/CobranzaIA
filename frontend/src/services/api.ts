const API_URL = "http://localhost:3002/api"

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