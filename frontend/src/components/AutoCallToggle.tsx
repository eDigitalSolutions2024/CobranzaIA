import { useEffect, useState } from "react"
import { getAutomationSettings, updateAutomationSettings } from "../services/settings"

// Interruptor global de llamadas automáticas — pide contraseña para confirmar (igual
// que el tipo de cambio) porque prender esto dispara llamadas reales con costo real a
// clientes reales, no es un ajuste cosmético.
export default function AutoCallToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAutomationSettings()
      .then((d) => setEnabled(d.autoCallsEnabled))
      .catch(() => setEnabled(false))
  }, [])

  function openModal() {
    setPassword("")
    setError("")
    setModalOpen(true)
  }

  async function handleConfirm() {
    setError("")
    if (!password) {
      setError("Enter your system password to confirm")
      return
    }
    setSaving(true)
    try {
      const result = await updateAutomationSettings(!enabled, password)
      setEnabled(result.autoCallsEnabled)
      setModalOpen(false)
    } catch (err: any) {
      setError(err.message || "Error updating setting")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        className={`rounded-xl px-5 py-3 font-medium cursor-pointer transition-colors ${
          enabled ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-zinc-800 hover:bg-zinc-700"
        }`}
      >
        Auto Calls: {enabled === null ? "…" : enabled ? "ON" : "OFF"}
      </button>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[var(--bg-main)] border border-[var(--border)] rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-1">
              {enabled ? "Turn off automatic calls?" : "Turn on automatic calls?"}
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              {enabled
                ? "The system will stop the automatic outreach cycle for all clients."
                : "The system will run the full outreach cycle automatically — call, call, WhatsApp message, final WhatsApp — in small batches, business hours only, stopping early if a client responds."}
            </p>

            <label className="text-sm text-zinc-400">System password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />

            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
