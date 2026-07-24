import { useEffect, useState } from "react"
import { getClientDetail } from "../services/clients"

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", contacted: "Contacted", negotiating: "Negotiating",
  promised: "Promise", paid: "Paid", no_response: "No response",
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 p-6">
          {data ? (
            <div>
              <h2 className="text-xl font-bold">{data.client.name}</h2>
              <p className="text-sm text-zinc-400 mt-1">
                {data.client.phone}
                {data.client.customerId != null && ` · Customer ID: ${data.client.customerId}`}
                {data.client.country && ` · ${data.client.country}`}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-sm">
                <span className="text-zinc-400">Debt:</span>
                <span className="font-medium text-white">
                  ${Number(data.client.debt).toLocaleString("en-US")} MXN
                </span>
                {data.client.usdAmount != null && (
                  <>
                    <span className="text-zinc-400 ml-2">USD:</span>
                    <span className="text-zinc-300">
                      ${Number(data.client.usdAmount).toLocaleString("en-US")}
                    </span>
                  </>
                )}
                <span className="text-zinc-400 ml-2">Status:</span>
                <span className="text-zinc-300">
                  {STATUS_LABEL[data.client.status] ?? data.client.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs text-zinc-500">
                {data.client.team && <span>Team: <span className="text-zinc-300">{data.client.team}</span></span>}
                {data.client.teamLeader && <span>Team Leader: <span className="text-zinc-300">{data.client.teamLeader}</span></span>}
                {data.client.collector && <span>Collector: <span className="text-zinc-300">{data.client.collector}</span></span>}
                {data.client.invoiceNumber && <span>Invoice #: <span className="text-zinc-300">{data.client.invoiceNumber}</span></span>}
                {data.client.loanLease && <span>Loan/Lease: <span className="text-zinc-300">{data.client.loanLease}</span></span>}
                {data.client.agingDays != null && <span>Aging Days: <span className="text-zinc-300">{data.client.agingDays}</span></span>}
                {data.client.createDate && <span>Create Date: <span className="text-zinc-300">{new Date(data.client.createDate).toLocaleDateString("en-US")}</span></span>}
                {data.client.dueDate && <span>Due Date: <span className="text-zinc-300">{new Date(data.client.dueDate).toLocaleDateString("en-US")}</span></span>}
                {data.client.contact && <span>Contact: <span className="text-zinc-300">{data.client.contact}</span></span>}
                {data.client.nextAction && <span>Next Action: <span className="text-zinc-300">{data.client.nextAction}</span></span>}
                {data.client.paymentPromiseAmount != null && <span>Payment Promise: <span className="text-zinc-300">${Number(data.client.paymentPromiseAmount).toLocaleString("en-US")}</span></span>}
                {data.client.datePromise && <span>Date Promise: <span className="text-zinc-300">{new Date(data.client.datePromise).toLocaleDateString("en-US")}</span></span>}
              </div>
            </div>
          ) : (
            <div className="text-zinc-500 text-sm">Loading...</div>
          )}
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-xl leading-none ml-4">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setTab("promises")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              tab === "promises" ? "border-b-2 border-blue-500 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Payment promises ({data?.promises?.length ?? 0})
          </button>
          <button
            onClick={() => setTab("calls")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              tab === "calls" ? "border-b-2 border-blue-500 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Calls ({data?.calls?.length ?? 0})
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {!data && (
            <div className="text-center text-zinc-500 py-8">Loading information...</div>
          )}

          {data && tab === "promises" && (
            <div className="space-y-3">
              {data.promises.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-6">No promises registered</p>
              )}
              {data.promises.map((p: any) => (
                <div key={p._id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-semibold text-white">
                        ${Number(p.amount).toLocaleString("en-US")} MXN
                      </p>
                      <p className="text-sm text-zinc-400 mt-0.5">
                        Commitment date:{" "}
                        <span className="text-zinc-200">
                          {new Date(p.promisedDate).toLocaleDateString("en-US", {
                            day: "numeric", month: "long", year: "numeric",
                          })}
                        </span>
                      </p>
                      {p.notes && (
                        <p className="text-xs text-zinc-600 mt-1">{p.notes}</p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${PROMISE_STATUS_COLOR[p.status]}`}>
                        {PROMISE_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                      {p.detectedByAI && (
                        <p className="text-xs text-zinc-600">Detected by AI</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && tab === "calls" && (
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
                          <span className="text-emerald-400 font-medium">
                            ${Number(call.amount).toLocaleString("en-US")} MXN
                          </span>
                          <span className="text-zinc-500 ml-2">
                            — {new Date(call.promiseDate).toLocaleDateString("en-US")}
                          </span>
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
                            turn.role === "assistant"
                              ? "bg-zinc-800 text-zinc-200"
                              : "bg-blue-600/20 text-blue-300"
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
    </div>
  )
}
