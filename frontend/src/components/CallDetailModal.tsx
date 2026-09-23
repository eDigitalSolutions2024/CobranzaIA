import {
  CALL_STATUS_COLOR,
  CALL_STATUS_LABEL,
  CallRecordingPlayer,
  CallTimelineView,
  formatDuration,
} from "./CallTimeline"

function formatMoney(value: any): string {
  if (value === null || value === undefined) return "—"
  return `$${Number(value).toLocaleString("en-US")}`
}

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

interface Props {
  call: any | null
  onClose: () => void
}

export default function CallDetailModal({ call, onClose }: Props) {
  if (!call) return null

  const clientName = call.clientId?.name ?? "Unknown"
  const clientPhone = call.clientId?.phone ?? call.phone

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{clientName}</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              {clientPhone} · {new Date(call.createdAt).toLocaleString("en-US")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${CALL_STATUS_COLOR[call.status] ?? "bg-zinc-500/10 text-zinc-400"}`}>
                {CALL_STATUS_LABEL[call.status] ?? call.status}
              </span>
              {call.status === "in_progress" && (
                <span className="text-xs text-emerald-400 animate-pulse">● Live</span>
              )}
              <span className="rounded-full px-3 py-1 text-xs font-medium bg-zinc-500/10 text-zinc-400">
                {call.triggeredBy === "auto" ? "Automatic" : "Manual"}
              </span>
              {call.detectedVoicemail && (
                <span className="rounded-full px-3 py-1 text-xs font-medium bg-purple-500/10 text-purple-400">
                  Voicemail
                </span>
              )}
              {call.requiresHuman && (
                <span className="rounded-full px-3 py-1 text-xs font-medium bg-orange-500/10 text-orange-400">
                  Requires agent
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-zinc-500 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-zinc-800">
            <StatTile label="Duration" value={formatDuration(call.durationSeconds)} />
            <StatTile
              label="Payment promise"
              value={call.promiseDate ? `${formatMoney(call.amount)} MXN` : "—"}
              sub={call.promiseDate ? new Date(call.promiseDate).toLocaleDateString("en-US") : undefined}
            />
            <StatTile label="Disposition" value={call.disposition ?? "—"} />
            <StatTile label="Next action" value={call.nextAction ?? "—"} />
          </div>

          {call.summary && (
            <div className="p-5 border-b border-zinc-800">
              <p className="text-xs text-zinc-500 mb-1">Summary</p>
              <p className="text-sm text-zinc-200 leading-relaxed">{call.summary}</p>
            </div>
          )}

          {call.recordingSid && <CallRecordingPlayer callId={call._id} />}

          <div className="p-5 space-y-4">
            <CallTimelineView call={call} />
          </div>
        </div>
      </div>
    </div>
  )
}
