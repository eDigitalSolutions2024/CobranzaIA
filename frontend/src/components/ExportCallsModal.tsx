import { useEffect, useState } from "react"
import { exportCallsExcel } from "../services/calls"
import MultiSelect from "./MultiSelect"
import { CALL_DISPOSITIONS, CALL_STATUS_LABEL, dispositionLabel } from "./CallTimeline"

const STATUS_OPTIONS = ["all", "in_progress", "completed", "requires_human", "failed"] as const

const SELECT_CLASS = "mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"

interface Props {
  isOpen: boolean
  onClose: () => void
  // Valores con los que arranca el modal: lo que ya estaba elegido en la página Calls
  initialStatus: string
  initialDisposition: string
}

// Se abre al hacer clic en "Export to Excel" en Calls. Solo pide el estado y las disposiciones
// (Follow up, Payment scheduled, No answer…), para descargar solo lo que el usuario necesita.
// Lo que se elige aquí es lo único que filtra el reporte: los demás filtros de la página no se
// arrastran en silencio. Arranca con el estado y las disposiciones que ya había en la tabla.
export default function ExportCallsModal({ isOpen, onClose, initialStatus, initialDisposition }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [disposition, setDisposition] = useState(initialDisposition)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStatus(initialStatus)
    setDisposition(initialDisposition)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  async function handleExport() {
    setExporting(true)
    try {
      await exportCallsExcel({ status, disposition })
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
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] flex flex-col"
      >
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Export calls to Excel</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              Choose the status and dispositions to download, or leave them empty to export everything.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-white transition-colors text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-zinc-500">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All statuses" : CALL_STATUS_LABEL[s] ?? s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-500">Dispositions</label>
            <MultiSelect
              label="All dispositions"
              value={disposition}
              onChange={setDisposition}
              options={CALL_DISPOSITIONS.map((d) => ({ value: d, label: dispositionLabel(d) }))}
              className={SELECT_CLASS}
            />
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
