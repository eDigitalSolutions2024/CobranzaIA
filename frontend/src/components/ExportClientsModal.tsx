import { useEffect, useState } from "react"
import { exportClientsExcel } from "../services/clients"
import { ReportFilterFields, useClientFilterOptions, EMPTY_REPORT_FILTERS, type ReportFilterValue } from "./ReportFilters"

interface Props {
  isOpen: boolean
  onClose: () => void
}

// Se abre al hacer clic en "Export Clients" — pide los 5 filtros de "Reporte Filters"
// (Country/Collector ID/Team/Team Leader/Collector, ver tarjeta del tablero) antes de
// generar el Excel. El archivo incluye 4 hojas (Clientes, Promesas de pago, Llamadas,
// Facturas) ya acotadas a los clientes que matcheen — sin ningún filtro elegido, exporta
// todo (mismo comportamiento que antes de esta tarjeta).
export default function ExportClientsModal({ isOpen, onClose }: Props) {
  const [filters, setFilters] = useState<ReportFilterValue>(EMPTY_REPORT_FILTERS)
  const [exporting, setExporting] = useState(false)
  const options = useClientFilterOptions()

  useEffect(() => {
    if (isOpen) setFilters(EMPTY_REPORT_FILTERS)
  }, [isOpen])

  if (!isOpen) return null

  async function handleExport() {
    setExporting(true)
    try {
      await exportClientsExcel(filters)
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
            <h2 className="text-lg font-semibold text-white">Export clients to Excel</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              Includes Clients, Payment promises, Calls and Invoices. Choose filters, or leave them empty to export everything.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-white transition-colors text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="p-5">
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
