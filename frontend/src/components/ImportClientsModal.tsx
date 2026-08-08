import { useRef, useState } from "react"
import { downloadClientsTemplate, importClientsExcel } from "../services/clients"

interface ImportResult {
  createdCount: number
  totalRows: number
  skipped: { row: number; phone: string; reason: string }[]
  errors: { row: number; message: string }[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

export default function ImportClientsModal({ isOpen, onClose, onImported }: Props) {
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
      const data = await importClientsExcel(file)
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-2">Import clients from Excel</h2>
        <p className="text-sm text-zinc-400 mb-4">
          The file must have <strong>CustomerName</strong> and <strong>Phone</strong> columns.
          Optional: RFC, Country, CustomerID, CollectorID, Team, TeamLeader, Collector, Invoice Number,
          Create Date, Due Date, Aging Days, Loan/Lease, Debt, USD Amount, Channel, Risk, Contact,
          Next Action, Payment Promise, Date Promise and Notes. Phone numbers that already exist are skipped;
          rows with an invalid RFC format are imported without RFC.
        </p>

        <button
          onClick={() => downloadClientsTemplate()}
          className="text-sm text-blue-400 hover:text-blue-300 underline mb-4"
        >
          Download sample template
        </button>

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
              {result.createdCount} of {result.totalRows} clients created
            </p>

            {result.skipped.length > 0 && (
              <div>
                <p className="text-sm text-zinc-400 mb-1">Skipped ({result.skipped.length}):</p>
                <ul className="text-xs text-zinc-500 space-y-0.5">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      Row {s.row} ({s.phone}): {s.reason}
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
