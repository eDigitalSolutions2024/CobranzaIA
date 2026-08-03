import { useEffect, useState } from "react"
import { getClientDetail } from "../services/clients"

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", contacted: "Contacted", negotiating: "Negotiating",
  promised: "Promise", paid: "Paid", no_response: "No response",
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-blue-500/10 text-blue-400",
  contacted: "bg-purple-500/10 text-purple-400",
  negotiating: "bg-orange-500/10 text-orange-400",
  promised: "bg-yellow-500/10 text-yellow-400",
  paid: "bg-green-500/10 text-green-400",
  no_response: "bg-zinc-500/10 text-zinc-400",
}

const RISK_LABEL: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" }

const RISK_COLOR: Record<string, string> = {
  low: "bg-green-500/10 text-green-400",
  medium: "bg-yellow-500/10 text-yellow-400",
  high: "bg-red-500/10 text-red-400",
}

const PROMISE_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", completed: "Fulfilled", broken: "Broken", cancelled: "Cancelled",
}

const PROMISE_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  completed: "bg-green-500/10 text-green-400",
  broken: "bg-red-500/10 text-red-400",
  cancelled: "bg-zinc-500/10 text-zinc-400",
}

const CALL_STATUS_COLOR: Record<string, string> = {
  in_progress: "bg-blue-500/10 text-blue-400",
  completed: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
  requires_human: "bg-orange-500/10 text-orange-400",
}

const CALL_STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress", completed: "Completed",
  failed: "Failed", requires_human: "Requires agent",
}

function formatDate(value: any): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

function formatMoney(value: any): string {
  if (value === null || value === undefined) return "—"
  return `$${Number(value).toLocaleString("en-US")}`
}

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-200 mt-0.5">{value}</p>
    </div>
  )
}

interface Props {
  clientId: string | null
  onClose: () => void
}

export default function ClientDetailModal({ clientId, onClose }: Props) {
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState<"promises" | "calls">("promises")
  const [expandedCall, setExpandedCall] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return
    setData(null)
    setTab("promises")
    setExpandedCall(null)
    getClientDetail(clientId).then(setData).catch(() => {})
  }, [clientId])

  if (!clientId) return null

  const client = data?.client

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 flex flex-col">

        {!data && <div className="p-16 text-center text-zinc-500">Loading...</div>}

        {client && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-6">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xl font-bold text-blue-400">
                  {client.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white truncate">{client.name}</h2>
                  <p className="text-sm text-zinc-400 mt-0.5 truncate">
                    {client.phone}
                    {client.country && ` · ${client.country}`}
                    {client.customerId != null && ` · ID ${client.customerId}`}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[client.status] || "bg-blue-500/10 text-blue-400"}`}>
                      {STATUS_LABEL[client.status] ?? client.status}
                    </span>
                    {client.risk && (
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${RISK_COLOR[client.risk] || "bg-zinc-500/10 text-zinc-400"}`}>
                        {RISK_LABEL[client.risk] ?? client.risk}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-white transition-colors text-xl leading-none">
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1">

              {/* Financial summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-6 border-b border-zinc-800">
                <StatTile label="Debt (MXN)" value={formatMoney(client.debt)} />
                <StatTile label="USD Amount" value={client.usdAmount != null ? formatMoney(client.usdAmount) : "—"} />
                <StatTile
                  label="Payment promise"
                  value={client.paymentPromiseAmount != null ? formatMoney(client.paymentPromiseAmount) : "—"}
                  sub={client.datePromise ? `Due ${formatDate(client.datePromise)}` : undefined}
                />
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5 p-6 border-b border-zinc-800">
                <Field label="Channel" value={client.channel} />
                <Field label="Contact" value={client.contact} />
                <Field label="Team" value={client.team} />
                <Field label="Team Leader" value={client.teamLeader} />
                <Field label="Collector" value={client.collector} />
                <Field label="Invoice #" value={client.invoiceNumber} />
                <Field label="Loan / Lease" value={client.loanLease} />
                <Field label="Aging Days" value={client.agingDays} />
                <Field label="Create Date" value={client.createDate ? formatDate(client.createDate) : null} />
                <Field label="Due Date" value={client.dueDate ? formatDate(client.dueDate) : null} />
                <Field label="Next Action" value={client.nextAction} />
                <Field label="Last Intent" value={client.lastIntent && client.lastIntent !== "general" ? client.lastIntent : null} />
                {client.notes && (
                  <div className="col-span-2 md:col-span-3">
                    <p className="text-xs text-zinc-500">Notes</p>
                    <p className="text-sm text-zinc-200 mt-0.5 whitespace-pre-wrap">{client.notes}</p>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex border-b border-zinc-800 px-6">
                <button
                  onClick={() => setTab("promises")}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    tab === "promises" ? "border-b-2 border-blue-500 text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Payment promises ({data.promises?.length ?? 0})
                </button>
                <button
                  onClick={() => setTab("calls")}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    tab === "calls" ? "border-b-2 border-blue-500 text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Calls ({data.calls?.length ?? 0})
                </button>
              </div>

              {/* Tab content */}
              <div className="p-6">
                {tab === "promises" && (
                  <div className="space-y-3">
                    {data.promises.length === 0 && (
                      <p className="text-zinc-500 text-sm text-center py-6">No promises registered</p>
                    )}
                    {data.promises.map((p: any) => (
                      <div key={p._id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-lg font-semibold text-white">
                              {formatMoney(p.amount)} MXN
                            </p>
                            <p className="text-sm text-zinc-400 mt-0.5">
                              Commitment date: <span className="text-zinc-200">{formatDate(p.promisedDate)}</span>
                            </p>
                            {p.notes && <p className="text-xs text-zinc-600 mt-1">{p.notes}</p>}
                          </div>
                          <div className="text-right space-y-1">
                            <span className={`rounded-full px-3 py-1 text-xs font-medium ${PROMISE_STATUS_COLOR[p.status]}`}>
                              {PROMISE_STATUS_LABEL[p.status] ?? p.status}
                            </span>
                            {p.detectedByAI && <p className="text-xs text-zinc-600">Detected by AI</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "calls" && (
                  <div className="space-y-3">
                    {data.calls.length === 0 && (
                      <p className="text-zinc-500 text-sm text-center py-6">No calls registered</p>
                    )}
                    {data.calls.map((call: any) => (
                      <div key={call._id} className="rounded-xl border border-zinc-800 bg-zinc-950">
                        <div className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm text-zinc-300">
                              {new Date(call.createdAt).toLocaleString("en-US")}
                            </p>
                            {call.promiseDate && (
                              <p className="text-sm mt-1">
                                <span className="text-emerald-400 font-medium">{formatMoney(call.amount)} MXN</span>
                                <span className="text-zinc-500 ml-2">— {formatDate(call.promiseDate)}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`rounded-full px-3 py-1 text-xs ${CALL_STATUS_COLOR[call.status]}`}>
                              {CALL_STATUS_LABEL[call.status] ?? call.status}
                            </span>
                            <button
                              onClick={() => setExpandedCall(expandedCall === call._id ? null : call._id)}
                              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 transition-colors"
                            >
                              {expandedCall === call._id ? "Hide" : `Transcript (${call.transcript?.length ?? 0})`}
                            </button>
                          </div>
                        </div>

                        {expandedCall === call._id && (
                          <div className="border-t border-zinc-800 p-4 space-y-3 max-h-64 overflow-y-auto">
                            {call.transcript?.map((turn: any, i: number) => (
                              <div key={i} className={`flex gap-2 ${turn.role === "assistant" ? "" : "flex-row-reverse"}`}>
                                <div className={`text-xs px-3 py-2 rounded-xl max-w-sm ${
                                  turn.role === "assistant" ? "bg-zinc-800 text-zinc-200" : "bg-blue-600/20 text-blue-300"
                                }`}>
                                  <span className="block text-[10px] mb-1 opacity-50">
                                    {turn.role === "assistant" ? "AI" : "Client"}
                                  </span>
                                  {turn.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </>
        )}

      </div>
    </div>
  )
}
