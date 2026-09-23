import { useEffect, useState } from "react"
import { exportCallsExcel } from "../services/calls"
import { ReportFilterFields, useClientFilterOptions, EMPTY_REPORT_FILTERS, type ReportFilterValue } from "./ReportFilters"
import { CALL_STATUS_LABEL } from "./CallTimeline"

const STATUS_OPTIONS = ["all", "in_progress", "completed", "requires_human", "failed"] as const

interface Props {
  isOpen: boolean
  onClose: () => void
  initialFilters: ReportFilterValue
  initialStatus: string
  initialSearch: string
}

// Se abre al hacer clic en "Export to Excel" en Calls — pide los 5 filtros de "Reporte
// Filters" (Country/Collector ID/Team/Team Leader/Collector) ahí mismo, en vez de
// depender de lo que ya esté filtrado en la tabla (aunque arranca con esos valores como
// punto de partida, para no obligar a re-elegir algo que la persona ya había filtrado).
export default function ExportCallsModal({ isOpen, onClose, initialFilters, initialStatus, initialSearch }: Props) {
  const [filters, setFilters] = useState<ReportFilterValue>(initialFilters)
  const [status, setStatus] = useState(initialStatus)
  const [search, setSearch] = useState(initialSearch)
  const [exporting, setExporting] = useState(false)
  const options = useClientFilterOptions()

  useEffect(() => {
    if (!isOpen) return
    setFilters(initialFilters)
    setStatus(initialStatus)
    setSearch(initialSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  async function handleExport() {
    setExporting(true)
    try {
      await exportCallsExcel({ status, search, ...filters })
      onClose()
    } catch {
      alert("Error exporting Excel file")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Export calls to Excel</h2>
            <p className="text-sm text-zinc-400 mt-0.5">Choose filters for the report, or leave them empty to export everything.</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-white transition-colors text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-zinc-500">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All statuses" : CALL_STATUS_LABEL[s] ?? s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-500">Search by client or phone</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500">Report filters</label>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ReportFilterFields
                value={filters}
                onChange={setFilters}
                options={options}
                selectClassName="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white w-full"
              />
            </div>
            {Object.values(filters).some((v) => v !== "") && (
              <button
                onClick={() => setFilters(EMPTY_REPORT_FILTERS)}
                className="mt-2 text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 p-5">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  )
}
