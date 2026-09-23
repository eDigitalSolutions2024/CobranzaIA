import { useEffect, useMemo, useState } from "react"
import { getCalls } from "../services/calls"
import CallDetailModal from "../components/CallDetailModal"
import ExportCallsModal from "../components/ExportCallsModal"
import { CALL_STATUS_COLOR, CALL_STATUS_LABEL, formatDuration } from "../components/CallTimeline"
import ReportFilters, { EMPTY_REPORT_FILTERS, type ReportFilterValue } from "../components/ReportFilters"

const STATUS_FILTERS = ["all", "in_progress", "completed", "requires_human", "failed"] as const

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([])
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all")
  const [search, setSearch] = useState("")
  const [reportFilters, setReportFilters] = useState<ReportFilterValue>(EMPTY_REPORT_FILTERS)
  const [exportModalOpen, setExportModalOpen] = useState(false)

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  async function load() {
    try {
      const data = await getCalls()
      setCalls(data)
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client or phone..."
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 min-w-64"
        />
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {s === "all" ? "All" : CALL_STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      <ReportFilters value={reportFilters} onChange={setReportFilters} />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="pb-4 text-sm text-zinc-500">Client</th>
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

      <CallDetailModal call={selectedCall} onClose={() => setSelectedCallId(null)} />

      <ExportCallsModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        initialFilters={reportFilters}
        initialStatus={statusFilter}
        initialSearch={search}
      />
    </div>
  )
}
