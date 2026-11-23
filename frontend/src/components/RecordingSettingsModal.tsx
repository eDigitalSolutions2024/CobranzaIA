import { useEffect, useState } from "react"
import { getRecordingSettings, updateRecordingSettings } from "../services/settings"

interface Props {
  isOpen: boolean
  onClose: () => void
}

// Qué grabaciones de Twilio se conservan: las llamadas más largas que el mínimo Y con una de las
// disposiciones marcadas. El resto se borra de Twilio al terminar la llamada. Aplica solo a
// llamadas nuevas (lo ya borrado no se recupera).
export default function RecordingSettingsModal({ isOpen, onClose }: Props) {
  const [available, setAvailable] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [minSeconds, setMinSeconds] = useState("30")
  const [recordingEnabled, setRecordingEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setError("")
    setSaved(false)
    setLoading(true)
    getRecordingSettings()
      .then((s) => {
        setAvailable(s.availableDispositions)
        setSelected(s.dispositions)
        setMinSeconds(String(s.minDurationSeconds))
        setRecordingEnabled(s.recordingEnabled)
      })
      .catch(() => setError("Could not load recording settings"))
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  function toggle(d: string) {
    setSaved(false)
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  async function handleSave() {
    const min = Number(minSeconds)
    if (!Number.isFinite(min) || min < 0 || min > 3600) {
      setError("Minimum duration must be between 0 and 3600 seconds")
      return
    }
    setError("")
    setSaving(true)
    try {
      await updateRecordingSettings(selected, min)
      setSaved(true)
    } catch (err: any) {
      setError(err.message || "Error saving recording settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-[var(--bg-main)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-white mb-1">Recording settings</h3>
        <p className="text-sm text-zinc-400 mb-4">
          Recordings are kept only for calls longer than the minimum duration that end in a selected disposition.
          All others are deleted from Twilio. Applies to new calls.
        </p>

        {!recordingEnabled && (
          <p className="mb-3 rounded-lg border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-300">
            Call recording is turned off on the server (VOICE_CALL_RECORDING_ENABLED), so nothing is being recorded.
          </p>
        )}

        {loading && <p className="text-sm text-zinc-500">Loading…</p>}

        <label className="block text-sm text-zinc-300 mb-1">Minimum call duration (seconds)</label>
        <input
          type="number"
          min={0}
          max={3600}
          value={minSeconds}
          onChange={(e) => {
            setMinSeconds(e.target.value)
            setSaved(false)
          }}
          className="w-full mb-4 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white text-sm"
        />

        <p className="text-sm text-zinc-300 mb-2">Keep recordings with disposition</p>
        <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-zinc-800 p-2">
          {available.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input type="checkbox" checked={selected.includes(d)} onChange={() => toggle(d)} />
              {d}
            </label>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {saved && <p className="mt-3 text-sm text-emerald-400">Saved. Applies to new calls.</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-light text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
