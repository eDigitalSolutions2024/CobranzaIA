import type { AttentionQueue } from "../services/blacklist"

// Nombres de las pestañas de clientes por atender (en un archivo aparte para que los componentes solo exporten
// componentes)
export const QUEUE_LABEL: Record<AttentionQueue, string> = {
  follow_up: "Follow up",
  needs_agent: "Needs agent",
  needs_admin: "Needs admin",
  collector: "Collector Assistance",
  all: "All pending",
}
