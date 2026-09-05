import { useEffect, useState } from "react"
import { updateExchangeRate } from "../services/settings"

interface Props {
  isOpen: boolean
  currentRate: number
  onClose: () => void
  onUpdated: (rate: number) => void
}

export default function ExchangeRateModal({ isOpen, currentRate, onClose, onUpdated }: Props) {
  const [rate, setRate] = useState(String(currentRate))
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setRate(String(currentRate))
      setPassword("")
      setError("")
    }
  }, [isOpen, currentRate])

  if (!isOpen) return null

  async function handleSubmit() {
    setError("")
    const parsed = Number(rate)

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
      const result = await updateExchangeRate(parsed, password)
      onUpdated(result.usdMxn)
      onClose()
    } catch (err: any) {
      setError(err.message || "Error updating exchange rate")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-[var(--bg-main)] border border-[var(--border)] rounded-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-white mb-1">Change exchange rate</h3>
        <p className="text-sm text-zinc-400 mb-4">
          Confirm your password to update the MXN → USD rate used to auto-convert new clients' debt.
        </p>

        <label className="text-sm text-zinc-400">Exchange rate (MXN per 1 USD)</label>
        <input
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="w-full mt-1 mb-3 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
        />

        <label className="text-sm text-zinc-400">System password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
        />

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Update rate"}
          </button>
        </div>
      </div>
    </div>
  )
}
