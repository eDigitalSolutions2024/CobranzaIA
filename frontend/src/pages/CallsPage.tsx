import { useEffect, useMemo, useState } from "react"
import { getCalls, getCallCounts, type CallCounts } from "../services/calls"
import CallDetailModal from "../components/CallDetailModal"
import ExportCallsModal from "../components/ExportCallsModal"
import { CALL_STATUS_COLOR, CALL_STATUS_LABEL, formatDuration } from "../components/CallTimeline"
import ReportFilters, { EMPTY_REPORT_FILTERS, type ReportFilterValue } from "../components/ReportFilters"

const STATUS_FILTERS = ["all", "in_progress", "completed", "requires_human", "failed"] as const
const PAGE_SIZE = 100

// Mismo catálogo que backend/src/config/disposition.ts
const DISPOSITIONS = [
  "No answer",
  "Voice mail",
  "Customer hung up",
  "Contact made - No resolution",
  "Follow up",
  "Payment scheduled",
  "Invoices received",
  "Extension required",
  "Invoice, statement or contract required",
  "Payment received",
  "Wrong number",
  "Email contact only",
  "Need invoice",
  "Phone number updated",
  "Prefers CAS support",
  "Payment refused",
  "Payment in process",
]

type CallExtraFilters = { disposition: string; promise: string; type: string; from: string; to: string }
const EMPTY_EXTRA: CallExtraFilters = { disposition: "", promise: "", type: "", from: "", to: "" }

const FILTER_CLASS = "rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([])
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all")
  const [search, setSearch] = useState("")
  const [reportFilters, setReportFilters] = useState<ReportFilterValue>(EMPTY_REPORT_FILTERS)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [counts, setCounts] = useState<CallCounts | null>(null)
  const [extra, setExtra] = useState<CallExtraFilters>(EMPTY_EXTRA)
  const [page, setPage] = useState(1)

  // Filtros que entienden el backend (estado, 5 filtros de reporte, buscador y los de la
  // llamada: disposition, promesa, tipo y fechas): la tabla y los contadores se piden con
  // ellos, así que los números cuadran con lo que se ve.
  const serverFilters = useMemo(
    () => ({ ...reportFilters, ...extra, status: statusFilter, search: search.trim(), page }),
    [reportFilters, extra, statusFilter, search, page]
  )

  // Cualquier cambio de filtro vuelve a la primera página
  function changeExtra(field: keyof CallExtraFilters, value: string) {
    setExtra((prev) => ({ ...prev, [field]: value }))
    setPage(1)
  }
  const hasExtraFilters = Object.values(extra).some(Boolean)
  const totalForStatus = counts ? counts[statusFilter] : 0
  const totalPages = Math.max(1, Math.ceil(totalForStatus / PAGE_SIZE))

  // Con debounce al teclear en el buscador; y cada 15 s para ver llamadas nuevas en vivo
  useEffect(() => {
    const timer = setTimeout(load, 250)
    const interval = setInterval(load, 15000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [serverFilters])

  async function load() {
    try {
      const [data, countData] = await Promise.all([getCalls(serverFilters), getCallCounts(serverFilters)])
      setCalls(data)
      setCounts(countData)
    } catch {}
  }

  const filteredCalls = useMemo(() => {
    const query = search.trim().toLowerCase()
    return calls.filter((call) => {
      if (statusFilter !== "all" && call.status !== statusFilter) return false
      if (reportFilters.country && call.clientId?.country !== reportFilters.country) return false
      if (reportFilters.collectorId && String(call.clientId?.collectorId ?? "") !== reportFilters.collectorId) return false
      if (reportFilters.team && call.clientId?.team !== reportFilters.team) return false
      if (reportFilters.teamLeader && call.clientId?.teamLeader !== reportFilters.teamLeader) return false
      if (reportFilters.collector && call.clientId?.collector !== reportFilters.collector) return false
      if (!query) return true
      const name = String(call.clientId?.name ?? "").toLowerCase()
      const phone = String(call.phone ?? "").toLowerCase()
      return name.includes(query) || phone.includes(query)
    })
  }, [calls, statusFilter, search, reportFilters])

  const selectedCall = calls.find((c) => c._id === selectedCallId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Calls</h1>
          <p className="mt-2 text-zinc-400">Collection call history</p>
        </div>
        <button
          onClick={() => setExportModalOpen(true)}
          className="rounded-xl bg-zinc-800 px-5 py-3 font-medium hover:bg-zinc-700 cursor-pointer"
        >
          Export to Excel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search by client or phone..."
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 min-w-64"
        />
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s)
                setPage(1)
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {s === "all" ? "All" : CALL_STATUS_LABEL[s] ?? s}
              <span className={`ml-1.5 ${statusFilter === s ? "text-blue-200" : "text-zinc-500"}`}>
                {counts ? counts[s].toLocaleString("en-US") : "…"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <ReportFilters
        value={reportFilters}
        onChange={(v) => {
          setReportFilters(v)
          setPage(1)
        }}
      />

      {/* Filtros propios de la llamada */}
      <div className="flex flex-wrap items-center gap-3">
        <select className={`${FILTER_CLASS} min-w-56`} value={extra.disposition} onChange={(e) => changeExtra("disposition", e.target.value)}>
          <option value="">All dispositions</option>
          {DISPOSITIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select className={`${FILTER_CLASS} min-w-44`} value={extra.promise} onChange={(e) => changeExtra("promise", e.target.value)}>
          <option value="">All (promise or not)</option>
          <option value="yes">With payment promise</option>
          <option value="no">Without payment promise</option>
        </select>
        <select className={`${FILTER_CLASS} min-w-36`} value={extra.type} onChange={(e) => changeExtra("type", e.target.value)}>
          <option value="">Automatic + manual</option>
          <option value="auto">Automatic</option>
          <option value="manual">Manual</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          From
          <input type="date" className={FILTER_CLASS} value={extra.from} onChange={(e) => changeExtra("from", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          To
          <input type="date" className={FILTER_CLASS} value={extra.to} onChange={(e) => changeExtra("to", e.target.value)} />
        </label>
        {hasExtraFilters && (
          <button
            onClick={() => {
              setExtra(EMPTY_EXTRA)
              setPage(1)
            }}
            className="text-xs text-zinc-400 hover:text-white underline"
          >
            Clear call filters
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="pb-4 text-sm text-zinc-500">Customer</th>
                <th className="pb-4 text-sm text-zinc-500">Phone</th>
                <th className="pb-4 text-sm text-zinc-500">Date</th>
                <th className="pb-4 text-sm text-zinc-500">Duration</th>
                <th className="pb-4 text-sm text-zinc-500">Type</th>
                <th className="pb-4 text-sm text-zinc-500">Status</th>
                <th className="pb-4 text-sm text-zinc-500">Disposition</th>
                <th className="pb-4 text-sm text-zinc-500">Payment promise</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.map((call) => (
                <tr
                  key={call._id}
                  onClick={() => setSelectedCallId(call._id)}
                  className="border-b border-zinc-800 hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-4 font-medium">
                    {call.clientId?.name ?? <span className="text-zinc-500">Unknown</span>}
                  </td>

                  <td className="py-4 text-zinc-400">{call.phone}</td>

                  <td className="py-4 text-zinc-400 text-sm">
                    {new Date(call.createdAt).toLocaleString("en-US")}
                  </td>

                  <td className="py-4 text-zinc-400 text-sm">
                    {formatDuration(call.durationSeconds)}
                  </td>

                  <td className="py-4">
                    <span className="rounded-full px-3 py-1 text-xs bg-zinc-500/10 text-zinc-400">
                      {call.triggeredBy === "auto" ? "Automatic" : "Manual"}
                    </span>
                  </td>

                  <td className="py-4">
                    <span className={`rounded-full px-3 py-1 text-sm ${CALL_STATUS_COLOR[call.status] ?? "bg-zinc-500/10 text-zinc-400"}`}>
                      {CALL_STATUS_LABEL[call.status] ?? call.status}
                      {call.status === "in_progress" && (
                        <span className="ml-1.5 inline-block animate-pulse">●</span>
                      )}
                    </span>
                  </td>

                  <td className="py-4 text-zinc-400 text-sm">
                    {call.disposition ?? "—"}
                  </td>

                  <td className="py-4">
                    {call.promiseDate ? (
                      <div className="text-sm">
                        <span className="text-emerald-400 font-medium">
                          ${Number(call.amount).toLocaleString("en-US")}
                        </span>
                        <span className="text-zinc-500 ml-2">
                          {new Date(call.promiseDate).toLocaleDateString("en-US")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-zinc-600 text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredCalls.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500">
                    No calls found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación: la tabla carga 100 llamadas a la vez */}
      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span>
          {totalForStatus === 0
            ? "0 calls"
            : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalForStatus)} of ${totalForStatus.toLocaleString("en-US")} calls`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <CallDetailModal call={selectedCall} onClose={() => setSelectedCallId(null)} />

      <ExportCallsModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        initialFilters={reportFilters}
        initialStatus={statusFilter}
        initialSearch={search}
        extraFilters={extra}
      />
    </div>
  )
}
