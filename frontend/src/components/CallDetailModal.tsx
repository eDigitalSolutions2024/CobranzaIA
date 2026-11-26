import {
  CALL_STATUS_COLOR,
  CALL_STATUS_LABEL,
  CallRecordingPlayer,
  CallTimelineView,
  dispositionLabel,
  formatDuration,
} from "./CallTimeline"
import ClientDetailModal from "./ClientDetailModal"
import { useState } from "react"
import TranscriptDownload from "./TranscriptDownload"
import FollowUpBadges from "./FollowUpBadges"

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
  // En pantallas anchas la ficha del cliente se abre junto a la llamada; en angostas se ve una a la vez
  const [showClient, setShowClient] = useState(() => window.innerWidth >= 1280)

  if (!call) return null

  const clientName = call.clientId?.name ?? "Unknown"
  const clientPhone = call.clientId?.phone ?? call.phone
  const clientId: string | null = call.clientId?._id ?? null
  const withClient = showClient && clientId !== null

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center gap-4 bg-black/70 p-4"
    >
      {/* La llamada es el panel principal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] flex-col overflow-hidden ${
          withClient ? "hidden xl:flex h-[90vh]" : "flex max-h-[90vh]"
        }`}
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
                {call.triggeredBy === "auto" ? "Automatic" : call.triggeredBy === "followup" ? "Follow-up" : "Manual"}
              </span>
              <FollowUpBadges call={call} />
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
            <div className="flex flex-wrap items-center gap-2">
              <TranscriptDownload key={call._id} call={call} clientName={clientName} clientPhone={clientPhone} />
              {clientId && (
                <button
                  onClick={() => setShowClient((v) => !v)}
                  className="mt-3 inline-flex items-center rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  {showClient ? "Hide client info" : "Client info"}
                </button>
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
            <StatTile label="Disposition" value={dispositionLabel(call.disposition)} />
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

      {withClient && (
        // stopPropagation: los clics dentro de la ficha (y de sus ventanas) no cierran la llamada
        <div onClick={(e) => e.stopPropagation()} className="flex h-[90vh] w-full max-w-2xl">
          <ClientDetailModal clientId={clientId} onClose={() => setShowClient(false)} embedded />
        </div>
      )}
    </div>
  )
}
