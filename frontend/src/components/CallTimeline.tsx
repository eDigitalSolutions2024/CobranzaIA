import { useEffect, useState } from "react"
import { apiBlobUrl } from "../services/api"

export const CALL_STATUS_COLOR: Record<string, string> = {
  in_progress: "bg-blue-500/10 text-blue-400",
  completed: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
  requires_human: "bg-orange-500/10 text-orange-400",
}

export const CALL_STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  requires_human: "Requires agent",
}

export function formatMs(ms?: number | null): string {
  if (ms == null) return ""
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatElapsed(ms?: number | null): string {
  if (ms == null) return "--:--"
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null) return "—"
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// Intercala mensajes del transcript con las funciones que la IA disparó durante la
// llamada, ordenados por elapsedMs — así se ve TODO el flujo en el orden real en que
// ocurrió, no dos listas separadas.
type CallTimelineItem =
  | { type: "message"; role: "assistant" | "user"; content: string; elapsedMs?: number | null; latencyMs?: number | null; durationMs?: number | null; key: string }
  | { type: "function"; name: string; elapsedMs: number; key: string }

export function buildCallTimeline(call: any): CallTimelineItem[] {
  const items: CallTimelineItem[] = []
  ;(call.transcript ?? []).forEach((turn: any, i: number) => {
    items.push({
      type: "message",
      role: turn.role,
      content: turn.content,
      elapsedMs: turn.elapsedMs,
      latencyMs: turn.latencyMs,
      durationMs: turn.durationMs,
      key: `m-${i}`,
    })
  })
  ;(call.functionCallLog ?? []).forEach((fn: any, i: number) => {
    items.push({ type: "function", name: fn.name, elapsedMs: fn.elapsedMs, key: `f-${i}` })
  })
  items.sort((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0))
  return items
}

// Solo aparece si la llamada tiene recordingSid (grabación activada vía
// VOICE_CALL_RECORDING_ENABLED en el backend — apagado por defecto por el costo extra
// de Twilio). El audio se pide autenticado (nunca se expone la URL/credenciales de
// Twilio al navegador) y se guarda como blob URL local mientras el modal está abierto.
export function CallRecordingPlayer({ callId }: { callId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setUrl(null)
    setError(false)

    apiBlobUrl(`/voice/${callId}/recording`)
      .then((blobUrl) => {
        if (cancelled) {
          window.URL.revokeObjectURL(blobUrl)
          return
        }
        objectUrl = blobUrl
        setUrl(blobUrl)
      })
      .catch(() => !cancelled && setError(true))

    return () => {
      cancelled = true
      if (objectUrl) window.URL.revokeObjectURL(objectUrl)
    }
  }, [callId])

  if (error) return null
  return (
    <div className="border-t border-zinc-800 px-6 py-3">
      {url ? (
        <audio controls src={url} className="w-full h-10" />
      ) : (
        <p className="text-xs text-zinc-500">Loading recording…</p>
      )}
    </div>
  )
}

// Se usa tanto en la caja compacta (dentro de la fila de la llamada) como en el modal
// grande — mismo cálculo de tiempos, solo cambia el tamaño/estilo de las burbujas.
export function CallTimelineView({ call, compact = false }: { call: any; compact?: boolean }) {
  const items = buildCallTimeline(call)
  if (items.length === 0) {
    return <p className={`text-center text-zinc-500 ${compact ? "text-xs py-2" : "text-sm"}`}>No transcript yet</p>
  }
  return (
    <>
      {items.map((item) => {
        if (item.type === "function") {
          return (
            <div key={item.key} className="flex justify-center">
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-400">
                ⚙ {item.name} · {formatElapsed(item.elapsedMs)}
              </span>
            </div>
          )
        }
        const isAssistant = item.role === "assistant"
        const timingBits: string[] = []
        if (item.latencyMs != null) {
          timingBits.push(isAssistant ? `respondió en ${formatMs(item.latencyMs)}` : `tardó ${formatMs(item.latencyMs)}`)
        }
        if (isAssistant && item.durationMs != null) {
          timingBits.push(`duró ${formatMs(item.durationMs)}`)
        }
        return (
          <div key={item.key} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
            <div
              className={`${compact ? "max-w-sm text-xs rounded-xl" : "max-w-md text-sm"} px-4 py-3 ${
                isAssistant
                  ? `bg-zinc-800 text-zinc-100 ${compact ? "" : "rounded-2xl rounded-bl-none"}`
                  : `${compact ? "bg-blue-600/20 text-blue-300" : "bg-blue-600 text-white rounded-2xl rounded-br-none"}`
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-1 opacity-60 text-[10px]">
                <span>{isAssistant ? "AI" : "Client"}</span>
                {item.elapsedMs != null && <span>{formatElapsed(item.elapsedMs)}</span>}
              </div>
              <p className={compact ? "" : "leading-relaxed"}>{item.content}</p>
              {timingBits.length > 0 && <p className="mt-1 text-[10px] opacity-50">{timingBits.join(" · ")}</p>}
            </div>
          </div>
        )
      })}
    </>
  )
}
