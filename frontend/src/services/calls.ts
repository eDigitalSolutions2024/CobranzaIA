import { api } from "./api"

export async function getCalls() {
  return api("/calls")
}
