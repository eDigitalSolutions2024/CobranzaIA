import { markClientHandled, markDocumentsSent, type AttentionQueue } from "../services/blacklist"
import { dispositionLabel } from "./CallTimeline"
import { QUEUE_LABEL } from "./attentionLabels"

const QUEUE_COLOR: Record<string, string> = {
  follow_up: "bg-blue-500/10 text-blue-400",
  needs_agent: "bg-orange-500/10 text-orange-400",
  needs_admin: "bg-yellow-500/10 text-yellow-400",
  collector: "bg-purple-500/10 text-purple-400",
}

const ESCALATION_LABEL: Record<string, string> = {
  dispute: "Dispute",
  customer_request: "Customer asked for an agent",
  followup_unresolved: "Follow up not resolved after 2 attempts",
}

function formatMoney(value: any): string {
  if (value === null || value === undefined) return "—"
  return `$${Number(value).toLocaleString("en-US")}`
}

// Por qué está el cliente en la cola, según lo que se sabe de él
function reasonOf(c: any): string {
  const parts: string[] = []
  if (c.queues.includes("collector") && c.escalationReason) parts.push(ESCALATION_LABEL[c.escalationReason] ?? c.escalationReason)
  if (c.queues.includes("needs_agent") && c.requiresHumanReason) parts.push(c.requiresHumanReason)
  if (c.queues.includes("needs_admin")) parts.push([(c.needsAdminDocuments ?? []).join(", "), c.needsAdminDetail].filter(Boolean).join(" — "))
  if (c.queues.includes("follow_up") && c.scheduledCallbackReason) parts.push(c.scheduledCallbackReason)
  return parts.filter(Boolean).join(" · ") || c.lastCallConclusion || "—"
}

interface Props {
  queue: AttentionQueue
  entries: any[]
  loading: boolean
  onOpenClient: (id: string) => void
  onChanged: () => void
}

export default function AttentionTable({ queue, entries, loading, onOpenClient, onChanged }: Props) {
  async function run(action: () => Promise<unknown>, question: string) {
    if (!confirm(question)) return
    try {
      await action()
      onChanged()
    } catch {
      alert("Error updating the client")
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800 text-left">
            {["Customer", "ID", "Amount owed", "Days overdue", "Last call", "Last result", "Reason", "Pending", "Next call", "Collector", ""].map((h, i) => (
              <th key={i} className="pb-3 pr-3 text-xs text-zinc-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((c) => (
            <tr key={c._id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
              <td onClick={() => onOpenClient(c._id)} className="py-3 pr-3 font-medium text-white cursor-pointer">{c.name}</td>
              <td className="py-3 pr-3 text-zinc-400 text-sm">{c.customerId ?? "—"}</td>
              <td className="py-3 pr-3 text-zinc-300 text-sm">{formatMoney(c.debt)}</td>
              <td className="py-3 pr-3 text-zinc-300 text-sm">{c.daysOverdue ?? 0}</td>
              <td className="py-3 pr-3 text-zinc-400 text-sm">{c.lastCallAt ? new Date(c.lastCallAt).toLocaleDateString("en-US") : "—"}</td>
              <td className="py-3 pr-3 text-zinc-400 text-sm">{dispositionLabel(c.lastCallDisposition)}</td>
              <td className="py-3 pr-3 text-zinc-400 text-sm max-w-52 truncate" title={reasonOf(c)}>{reasonOf(c)}</td>
              <td className="py-3 pr-3">
                <div className="flex flex-wrap gap-1">
                  {c.queues.map((q: AttentionQueue) => (
                    <span key={q} className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${QUEUE_COLOR[q]}`}>{QUEUE_LABEL[q]}</span>
                  ))}
                </div>
              </td>
              <td className="py-3 pr-3 text-zinc-400 text-sm">{c.scheduledCallbackAt ? new Date(c.scheduledCallbackAt).toLocaleString("en-US") : "—"}</td>
              <td className="py-3 pr-3 text-zinc-400 text-sm">{c.collector || "—"}</td>
              <td className="py-3">
                <div className="flex flex-col items-start gap-1 whitespace-nowrap">
                  {(c.queues.includes("needs_agent") || c.queues.includes("collector")) && (
                    <button
                      onClick={() => run(() => markClientHandled(c._id), `Mark ${c.name} as handled? The customer will be called automatically again.`)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    >
                      Mark handled
                    </button>
                  )}
                  {c.queues.includes("needs_admin") && (
                    <button
                      onClick={() => run(() => markDocumentsSent(c._id), `Mark the documents for ${c.name} as sent?`)}
                      className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                    >
                      Mark sent
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {!loading && entries.length === 0 && (
            <tr>
              <td colSpan={11} className="py-8 text-center text-zinc-500">No clients in {QUEUE_LABEL[queue]}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
