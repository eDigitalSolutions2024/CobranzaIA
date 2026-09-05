import { useRef, useState } from "react"
import { importInvoicesExcel } from "../services/clients"

interface ImportResult {
  createdCount: number
  updatedCount: number
  totalRows: number
  skipped: { row: number; invoiceNumber: string; reason: string }[]
  errors: { row: number; message: string }[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

export default function ImportInvoicesModal({ isOpen, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await importInvoicesExcel(file)
      setResult(data)
      onImported()
    } catch (err: any) {
      setError(err.message || "Error importing the file")
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleClose() {
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-main)] border border-[var(--border)] rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-2">Import invoices from Excel</h2>
        <p className="text-sm text-zinc-400 mb-4">
          The file must have <strong>Customer ID</strong> and <strong>Invoice Number</strong> columns —
          each row is matched to an existing client by Customer ID. Optional: Hptf Invoice Number,
          Contract Number, Invoice Type, Invoice Create Date, Payment Due Date, Invoice Amount,
          USD Remaining Amount Due, Aging Target, Collector, TL, Currency Code and Customer Country.
          Re-importing the same Invoice Number updates that invoice instead of duplicating it.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          disabled={loading}
          className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-white hover:file:bg-brand-light disabled:opacity-50"
        />

        {loading && <p className="text-sm text-zinc-400 mt-4">Importing…</p>}

        {error && <p className="text-sm text-red-400 mt-4">{error}</p>}

        {result && (
          <div className="mt-4 space-y-3 max-h-72 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-sm font-medium text-emerald-400">
              {result.createdCount} created, {result.updatedCount} updated of {result.totalRows} rows
            </p>

            {result.skipped.length > 0 && (
              <div>
                <p className="text-sm text-zinc-400 mb-1">Skipped ({result.skipped.length}):</p>
                <ul className="text-xs text-zinc-500 space-y-0.5">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      Row {s.row} ({s.invoiceNumber}): {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.errors.length > 0 && (
              <div>
                <p className="text-sm text-zinc-400 mb-1">Errors ({result.errors.length}):</p>
                <ul className="text-xs text-red-400/80 space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
