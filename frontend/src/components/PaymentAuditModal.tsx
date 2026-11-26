import { useEffect, useRef, useState } from "react"
import MultiSelect, { splitSelected } from "./MultiSelect"
import { CALL_DISPOSITIONS, CallTimelineView, dispositionLabel } from "./CallTimeline"
import {
  AUDIT_BATCH,
  analyzePaymentAudit,
  confirmPaymentFinding,
  dismissPaymentFinding,
  getPaymentAuditFindings,
  previewPaymentAudit,
  type AuditPreview,
} from "../services/paymentAudit"

// Las llamadas que ya están clasificadas como pago no se revisan
const PAYMENT_DISPOSITIONS = ["Payment scheduled", "Payment in process", "Payment received"]
const REVIEWABLE = CALL_DISPOSITIONS.filter((d) => !PAYMENT_DISPOSITIONS.includes(d))

const INPUT_CLASS = "w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"

function formatMoney(value: any): string {
  if (value === null || value === undefined) return "—"
  return `$${Number(value).toLocaleString("en-US")}`
}

// Un hallazgo por verificar: lo que se detectó, la frase del cliente y el transcript; la persona confirma o descarta
function Finding({ call, onResolved }: { call: any; onResolved: () => void }) {
  const audit = call.paymentAudit
  const isPromise = audit.type === "Payment scheduled"
  const [date, setDate] = useState<string>(audit.date ?? "")
  const [amount, setAmount] = useState<string>(String(audit.amount ?? call.clientId?.debt ?? ""))
  const [showTranscript, setShowTranscript] = useState(false)
  const [saving, setSaving] = useState(false)

  async function resolve(action: () => Promise<unknown>) {
    setSaving(true)
    try {
      await action()
      onResolved()
    } catch (err: any) {
      alert(err.message || "Error updating the call")
    } finally {
      setSaving(false)
    }
  }

  function confirmFinding() {
    if (isPromise && !date) {
      alert("A payment promise needs a date")
      return
    }
    if (!confirm(`Change this call from "${dispositionLabel(call.disposition)}" to "${audit.type}"?`)) return
    resolve(() => confirmPaymentFinding(call._id, { date: date || undefined, amount: Number(amount) || undefined }))
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-[var(--bg-primary)] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-white">{call.clientId?.name ?? "Unknown"}</p>
          <p className="text-xs text-zinc-500">{new Date(call.createdAt).toLocaleString("en-US")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-300">{dispositionLabel(call.disposition)}</span>
          <span className="text-zinc-500">→</span>
          <span className="rounded-full bg-green-500/20 px-3 py-1 font-medium text-green-400">{audit.type}</span>
        </div>
      </div>

      <p className="rounded-lg border-l-2 border-green-500 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">“{audit.quote}”</p>
      {audit.explanation && <p className="text-xs text-zinc-400">{audit.explanation}</p>}

      <div className="flex flex-wrap items-end gap-3">
        {audit.type !== "Payment received" && (
          <label className="text-xs text-zinc-500">
            Payment date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT_CLASS} mt-1 [color-scheme:dark]`} />
          </label>
        )}
        {isPromise && (
          <label className="text-xs text-zinc-500">
            Amount (MXN) · customer debt {formatMoney(call.clientId?.debt)}
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${INPUT_CLASS} mt-1`} />
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowTranscript((v) => !v)} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 cursor-pointer">
            {showTranscript ? "Hide transcript" : "Transcript"}
          </button>
          <button
            onClick={() => resolve(() => dismissPaymentFinding(call._id))}
            disabled={saving}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 cursor-pointer"
          >
            Dismiss
          </button>
          <button onClick={confirmFinding} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer">
            Confirm
          </button>
        </div>
      </div>

      {showTranscript && (
        <div className="max-h-72 overflow-y-auto space-y-3 border-t border-zinc-800 pt-3">
          <CallTimelineView call={call} />
        </div>
      )}
    </div>
  )
}

interface Props {
  isOpen: boolean
  onClose: () => void
  // Valores con los que arranca el modal: lo que estaba filtrado en la página Calls
  initialDisposition: string
  initialFrom: string
  initialTo: string
  // Se llama al confirmar un hallazgo, para refrescar la tabla de Calls
  onChanged: () => void
}

// Revisa llamadas ya guardadas buscando pagos mal clasificados: se eligen disposiciones y fechas, se analizan solo
// esas y cada hallazgo se confirma o descarta a mano.
export default function PaymentAuditModal({ isOpen, onClose, initialDisposition, initialFrom, initialTo, onChanged }: Props) {
  const [dispositions, setDispositions] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [preview, setPreview] = useState<AuditPreview | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number; found: number; failed: number } | null>(null)
  const [busy, setBusy] = useState<"searching" | "analyzing" | null>(null)
  const [error, setError] = useState("")
  const [findings, setFindings] = useState<any[]>([])
  const [totalFindings, setTotalFindings] = useState(0)
  const stop = useRef(false)

  async function loadFindings() {
    try {
      const data = await getPaymentAuditFindings()
      setFindings(data.findings)
      setTotalFindings(data.total)
    } catch (err: any) {
      setError(err.message || "Error loading the findings")
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const initial = splitSelected(initialDisposition).filter((d) => REVIEWABLE.includes(d))
    setDispositions(initial.length ? initial.join("|") : "Follow up")
    setFrom(initialFrom)
    setTo(initialTo)
    setPreview(null)
    setProgress(null)
    setError("")
    loadFindings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  // Cambiar un filtro invalida la búsqueda anterior
  function changeFilter(apply: () => void) {
    apply()
    setPreview(null)
    setProgress(null)
  }

  async function handleSearch() {
    setError("")
    setProgress(null)
    setBusy("searching")
    try {
      setPreview(await previewPaymentAudit({ dispositions, from, to, includeReviewed }))
    } catch (err: any) {
      setError(err.message || "Error searching calls")
    } finally {
      setBusy(null)
    }
  }

  async function handleAnalyze() {
    if (!preview) return
    const ids = preview.callIds
    const state = { done: 0, total: ids.length, found: 0, failed: 0 }
    stop.current = false
    setError("")
    setProgress({ ...state })
    setBusy("analyzing")
    try {
      for (let i = 0; i < ids.length && !stop.current; i += AUDIT_BATCH) {
        const batch = ids.slice(i, i + AUDIT_BATCH)
        const result = await analyzePaymentAudit(batch)
        state.done += batch.length
        state.found += result.found
        state.failed += result.failed
        setProgress({ ...state })
        if (result.found > 0) await loadFindings()
      }
    } catch (err: any) {
      setError(err.message || "Error analyzing calls")
    } finally {
      setBusy(null)
      setPreview(null)
      loadFindings()
    }
  }

  function handleClose() {
    stop.current = true
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-main)]">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Review payments in calls</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Finds payment promises, payments in process or already made in calls classified as something else. Nothing changes until you confirm it.
            </p>
          </div>
          <button onClick={handleClose} className="shrink-0 text-xl leading-none text-zinc-500 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3 border-b border-zinc-800 p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="text-xs text-zinc-500">
                Calls with disposition
                <div className="mt-1">
                  <MultiSelect
                    label="Choose dispositions"
                    value={dispositions}
                    onChange={(v) => changeFilter(() => setDispositions(v))}
                    options={REVIEWABLE.map((d) => ({ value: d, label: dispositionLabel(d) }))}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <label className="text-xs text-zinc-500">
                From
                <input type="date" value={from} onChange={(e) => changeFilter(() => setFrom(e.target.value))} className={`${INPUT_CLASS} mt-1 [color-scheme:dark]`} />
              </label>
              <label className="text-xs text-zinc-500">
                To
                <input type="date" value={to} onChange={(e) => changeFilter(() => setTo(e.target.value))} className={`${INPUT_CLASS} mt-1 [color-scheme:dark]`} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={includeReviewed} onChange={(e) => changeFilter(() => setIncludeReviewed(e.target.checked))} />
              Analyze again calls already reviewed with no result
            </label>

            {preview && (
              <p className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                {preview.matching} calls match · {preview.withPayment} talk about payment · <strong>{preview.callIds.length} will be analyzed</strong>
                {preview.alreadyReviewed > 0 && ` · ${preview.alreadyReviewed} already reviewed`}
                {preview.truncated && " · only the most recent 2,000 are included, narrow the dates"}
              </p>
            )}
            {progress && (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  {progress.done} of {progress.total} analyzed · {progress.found} to verify
                  {progress.failed > 0 && ` · ${progress.failed} failed (search again to retry)`}
                </p>
              </div>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
              {busy === "analyzing" ? (
                <button onClick={() => (stop.current = true)} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700 cursor-pointer">
                  Stop
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSearch}
                    disabled={busy !== null || !dispositions}
                    className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 cursor-pointer"
                  >
                    {busy === "searching" ? "Searching..." : "Search calls"}
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={!preview || preview.callIds.length === 0}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Analyze{preview ? ` ${preview.callIds.length} calls` : ""}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3 p-5">
            <h3 className="text-sm font-semibold text-white">To verify ({totalFindings})</h3>
            {findings.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">No findings waiting for review</p>}
            {findings.map((call) => (
              <Finding
                key={call._id}
                call={call}
                onResolved={() => {
                  loadFindings()
                  onChanged()
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
