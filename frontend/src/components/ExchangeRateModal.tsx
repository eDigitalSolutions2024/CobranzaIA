import { useEffect, useState } from "react"
import { getExchangeRates, updateExchangeRate } from "../services/settings"

interface Rate {
  currencyCode: string
  rateToMxn: number
  updatedAt: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  // Se llama después de cada guardado exitoso, con la lista completa ya actualizada —
  // así quien abrió el modal (ej. NewClientModal) puede refrescar su propia copia sin
  // tener que volver a pedirla.
  onUpdated?: (rates: Rate[]) => void
}

// Modal único para administrar el tipo de cambio de TODAS las monedas que puedan
// aparecer en facturas (USD, PEN, COP, CLP, etc.) — antes solo manejaba un valor fijo
// USD/MXN. Cada fila se edita con su propia confirmación de contraseña, igual que el
// flujo anterior.
export default function ExchangeRateModal({ isOpen, onClose, onUpdated }: Props) {
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(false)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [rateInput, setRateInput] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const [newCode, setNewCode] = useState("")
  const [addingNew, setAddingNew] = useState(false)

  function load() {
    setLoading(true)
    getExchangeRates()
      .then(setRates)
      .catch(() => setError("Could not load exchange rates"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!isOpen) return
    setEditingCode(null)
    setAddingNew(false)
    setNewCode("")
    setPassword("")
    setError("")
    load()
  }, [isOpen])

  if (!isOpen) return null

  function startEdit(rate: Rate) {
    setEditingCode(rate.currencyCode)
    setRateInput(String(rate.rateToMxn))
    setPassword("")
    setError("")
    setAddingNew(false)
  }

  function startAddNew() {
    setAddingNew(true)
    setEditingCode(null)
    setNewCode("")
    setRateInput("")
    setPassword("")
    setError("")
  }

  async function handleSave(currencyCode: string) {
    setError("")
    const code = currencyCode.trim().toUpperCase()
    const parsed = Number(rateInput)

    if (!/^[A-Z]{3}$/.test(code)) {
      setError("Enter a valid 3-letter currency code (e.g. USD, PEN, COP)")
      return
    }
    if (!parsed || parsed <= 0) {
      setError("Enter a valid exchange rate")
      return
    }
    if (!password) {
      setError("Enter your system password to confirm")
      return
    }

    setSaving(true)
    try {
      await updateExchangeRate(code, parsed, password)
      setEditingCode(null)
      setAddingNew(false)
      setPassword("")
      const fresh = await getExchangeRates()
      setRates(fresh)
      onUpdated?.(fresh)
    } catch (err: any) {
      setError(err.message || "Error updating exchange rate")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-[var(--bg-main)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-white mb-1">Exchange rates</h3>
        <p className="text-sm text-zinc-400 mb-4">
          Rates used to convert invoice/debt amounts into pesos (MXN = 1, always the base).
        </p>

        {loading && <p className="text-sm text-zinc-500">Loading…</p>}

        <div className="space-y-2">
          {rates.map((r) => (
            <div key={r.currencyCode} className="rounded-lg border border-zinc-800 p-3">
              {editingCode === r.currencyCode ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-16 font-mono text-sm text-zinc-300">{r.currencyCode}</span>
                    <input
                      type="number"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      placeholder="Rate to MXN"
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white text-sm"
                    />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="System password"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingCode(null)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSave(r.currencyCode)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light text-xs disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-sm text-white">{r.currencyCode}</span>
                    <span className="text-zinc-400 text-sm ml-2">1 {r.currencyCode} = {r.rateToMxn} MXN</span>
                  </div>
                  <button onClick={() => startEdit(r)} className="text-xs text-blue-400 hover:text-blue-300">
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}

          {!loading && rates.length === 0 && !addingNew && (
            <p className="text-sm text-zinc-500 text-center py-2">No currencies configured yet.</p>
          )}
        </div>

        {addingNew ? (
          <div className="mt-3 rounded-lg border border-zinc-800 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="Code (USD, PEN...)"
                maxLength={3}
                className="w-28 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white text-sm uppercase"
              />
              <input
                type="number"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="Rate to MXN"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white text-sm"
              />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="System password"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAddingNew(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave(newCode)}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light text-xs disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={startAddNew} className="mt-3 text-sm text-blue-400 hover:text-blue-300">
            + Add currency
          </button>
        )}

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
