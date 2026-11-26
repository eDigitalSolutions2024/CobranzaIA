import { useEffect, useRef, useState } from "react"
import { getAttentionQueue, getBlacklist, updateBlacklistEntry, searchClients, type AttentionResponse, type BlacklistFilters } from "../services/blacklist"
import ClientDetailModal from "./ClientDetailModal"
import type { ReportFilterValue } from "./ReportFilters"
import AttentionTable from "./AttentionTable"
import { QUEUE_LABEL } from "./attentionLabels"

const TAB_DESCRIPTION = {
  blacklist: "Customers with a payment refusal detected by the AI or added manually",
  follow_up: "Customers waiting for a second call from the AI agent",
  needs_agent: "Customers that a human agent has to contact",
  needs_admin: "Customers waiting for documents from an administrator",
  collector: "Cases assigned to a collector (disputes, requests for a person, unresolved follow ups)",
  all: "Every customer with a pending follow up or action from a person",
}

const STATUS_LABEL: Record<string, string> = { candidate: "Candidate", confirmed: "Confirmed" }
const STATUS_COLOR: Record<string, string> = {
  candidate: "bg-yellow-500/10 text-yellow-400",
  confirmed: "bg-yellow-500/10 text-yellow-400",
}

function formatMoney(value: any): string {
  if (value === null || value === undefined) return "—"
  return `$${Number(value).toLocaleString("en-US")}`
}

// Fila con "Asignado a" editable inline — evita tener que abrir un modal aparte solo
// para escribir el nombre de la persona de cobranza que da seguimiento al caso.
function AssignField({ clientId, value, onSaved }: { clientId: string; value: string; onSaved: (v: string) => void }) {
  const [text, setText] = useState(value)
  const [saving, setSaving] = useState(false)
  const dirty = text !== (value || "")

  async function save() {
    setSaving(true)
    try {
      await updateBlacklistEntry(clientId, { blacklistAssignedTo: text || null })
      onSaved(text)
    } catch {
      alert("Error assigning case")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Unassigned"
        className="w-32 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white placeholder:text-zinc-600"
      />
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          {saving ? "..." : "Save"}
        </button>
      )}
    </div>
  )
}

function AddToBlacklistModal({ isOpen, onClose, onAdded }: { isOpen: boolean; onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setQuery(""); setResults([]); setSelected(null); setReason("")
    }
  }, [isOpen])

  useEffect(() => {
    if (!query.trim() || selected) { setResults([]); return }
    const t = setTimeout(() => {
      searchClients(query).then(setResults).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [query, selected])

  if (!isOpen) return null

  async function handleAdd() {
    if (!selected) return
    setSaving(true)
    try {
      await updateBlacklistEntry(selected._id, {
        blacklistStatus: "confirmed",
        blacklistReason: reason || "Agregado manualmente",
      })
      onAdded()
      onClose()
    } catch {
      alert("Error adding client")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Add client to Blacklist</h2>

        {!selected ? (
          <div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client by name..."
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
            />
            {results.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                {results.map((c) => (
                  <button
                    key={c._id}
                    onClick={() => setSelected(c)}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    {c.name} <span className="text-zinc-500">· {formatMoney(c.debt)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-zinc-900 px-3 py-2 flex items-center justify-between">
              <span className="text-sm text-white">{selected.name}</span>
              <button onClick={() => setSelected(null)} className="text-xs text-zinc-500 hover:text-white">Change</button>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for the refusal (optional)"
              rows={2}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 resize-none"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selected || saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Adding..." : "Add to Blacklist"}
          </button>
        </div>
      </div>
    </div>
  )
}

// Filas por página en todas las pestañas (las colas se paginan en el servidor con el mismo tamaño)
const PAGE_SIZE = 10

const TABS = ["blacklist", "follow_up", "needs_agent", "needs_admin", "collector", "all"] as const
type Tab = (typeof TABS)[number]

// Contenedor de clientes por atender dentro del Dashboard, con pestañas. "Blacklist" (ver tarjeta "Implementar
// Blacklist de Clientes Morosos") son los clientes con negativa de pago detectada por la IA (voz o WhatsApp,
// marcados como 'candidate' vía Client.blacklistStatus) o confirmados por un administrador; las demás pestañas
// son las colas que necesitan a una persona (ver AttentionTable). El historial de llamadas/mensajes reutiliza el
// ClientDetailModal que ya existe, en vez de construir una vista de historial aparte.
export default function BlacklistSection({ reportFilters }: { reportFilters: ReportFilterValue }) {
  // Texto con los filtros del Dashboard, para recargar solo cuando de verdad cambian
  const filtersKey = JSON.stringify(reportFilters)
  const [tab, setTab] = useState<Tab>("blacklist")
  const [queueEntries, setQueueEntries] = useState<any[]>([])
  const [counts, setCounts] = useState<AttentionResponse["counts"] | null>(null)
  const [queueTotal, setQueueTotal] = useState(0)
  const [page, setPage] = useState(1)
  // Solo se aplica la respuesta de la petición más reciente (al cambiar rápido de página o pestaña)
  const lastRequest = useRef(0)
  const [loadError, setLoadError] = useState(false)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<BlacklistFilters["status"]>("all")
  const [search, setSearch] = useState("")
  const [minDaysOverdue, setMinDaysOverdue] = useState("")
  const [detailId, setDetailId] = useState<string | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)

  async function load() {
    const request = ++lastRequest.current
    try {
      if (tab === "blacklist") {
        const data = await getBlacklist({ status, search, minDaysOverdue, ...reportFilters })
        if (request !== lastRequest.current) return
        setEntries(data)
      }
      // Los contadores de las pestañas se piden siempre; en la pestaña Blacklist se ignoran las filas
      const queue = await getAttentionQueue({
        queue: tab === "blacklist" ? "follow_up" : tab,
        ...(tab === "blacklist" ? {} : { search, minDaysOverdue, page }),
        ...reportFilters,
      })
      if (request !== lastRequest.current) return
      setCounts(queue.counts)
      if (tab !== "blacklist") {
        setQueueEntries(queue.entries)
        setQueueTotal(queue.total)
        // El servidor ajusta la página si ya no existe
        if (queue.page !== page) setPage(queue.page)
      }
      setLoadError(false)
    } catch {
      // Se reintenta en el próximo poll; se avisa para que no parezca que la lista está vacía
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, status, search, minDaysOverdue, page, filtersKey])

  // Al cambiar los filtros del Dashboard se vuelve a la primera página
  useEffect(() => {
    setPage(1)
  }, [filtersKey])

  function changeTab(next: Tab) {
    if (next === tab) return
    setQueueEntries([])
    setQueueTotal(0)
    setPage(1)
    setLoading(true)
    setTab(next)
  }

  async function handleConfirm(clientId: string) {
    await updateBlacklistEntry(clientId, { blacklistStatus: "confirmed" })
    load()
  }

  async function handleRemove(clientId: string) {
    if (!confirm("Remove this client from the Blacklist?")) return
    await updateBlacklistEntry(clientId, { blacklistStatus: "none" })
    load()
  }

  // La Blacklist llega completa (más recientes primero) y se pagina aquí; las colas ya vienen paginadas
  const total = tab === "blacklist" ? entries.length : queueTotal
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const blacklistRows = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className={`rounded-2xl border bg-[var(--bg-main)] p-6 ${tab === "blacklist" ? "border-red-900/40" : "border-[var(--border)]"}`}>
      <div className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-zinc-800 mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => changeTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
              tab === t ? "border-b-2 border-blue-500 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "blacklist" ? "Blacklist" : QUEUE_LABEL[t]}
            {counts && <span className="ml-1.5 text-xs text-zinc-500">{counts[t]}</span>}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">{tab === "blacklist" ? "Blacklist" : QUEUE_LABEL[tab]}</h2>
          <p className="text-sm text-zinc-400 mt-0.5">{TAB_DESCRIPTION[tab]}</p>
        </div>
        {tab === "blacklist" && (
          <button
            onClick={() => setAddModalOpen(true)}
            className="rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/40 transition-colors"
          >
            + Add client
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search by client..."
          className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        />
        <input
          type="number"
          value={minDaysOverdue}
          onChange={(e) => {
            setMinDaysOverdue(e.target.value)
            setPage(1)
          }}
          placeholder="Min. days overdue"
          className="w-36 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        />
        <div className={tab === "blacklist" ? "flex gap-2" : "hidden"}>
          {(["all", "candidate", "confirmed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s)
                setPage(1)
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                status === s ? "bg-[var(--wave-red)] text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-300">
          Could not load these lists. Check that the server is running and up to date; it will retry automatically.
        </p>
      )}

      {tab !== "blacklist" && !(loadError && queueEntries.length === 0) && (
        <AttentionTable queue={tab} entries={queueEntries} loading={loading} onOpenClient={setDetailId} onChanged={load} />
      )}

      <div className={tab === "blacklist" ? "overflow-x-auto" : "hidden"}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="pb-3 text-xs text-zinc-500">Customer</th>
              <th className="pb-3 text-xs text-zinc-500">ID</th>
              <th className="pb-3 text-xs text-zinc-500">Amount owed</th>
              <th className="pb-3 text-xs text-zinc-500">Days overdue</th>
              <th className="pb-3 text-xs text-zinc-500">Last contact</th>
              <th className="pb-3 text-xs text-zinc-500">Reason</th>
              <th className="pb-3 text-xs text-zinc-500">Status</th>
              <th className="pb-3 text-xs text-zinc-500">Assigned to</th>
              <th className="pb-3 text-xs text-zinc-500"></th>
            </tr>
          </thead>
          <tbody>
            {blacklistRows.map((c) => (
              <tr key={c._id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td onClick={() => setDetailId(c._id)} className="py-3 font-medium text-white cursor-pointer">
                  {c.name}
                </td>
                <td className="py-3 text-zinc-400 text-sm">{c.customerId ?? "—"}</td>
                <td className="py-3 text-zinc-300 text-sm">{formatMoney(c.debt)}</td>
                <td className="py-3 text-zinc-300 text-sm">{c.daysOverdue ?? 0}</td>
                <td className="py-3 text-zinc-400 text-sm">
                  {c.lastContactAt ? new Date(c.lastContactAt).toLocaleDateString("en-US") : "—"}
                </td>
                <td className="py-3 text-zinc-400 text-sm max-w-52 truncate" title={c.blacklistReason || ""}>
                  {c.blacklistReason || "—"}
                </td>
                <td className="py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[c.blacklistStatus] ?? "bg-zinc-500/10 text-zinc-400"}`}>
                    {STATUS_LABEL[c.blacklistStatus] ?? c.blacklistStatus}
                  </span>
                </td>
                <td className="py-3">
                  <AssignField
                    clientId={c._id}
                    value={c.blacklistAssignedTo || ""}
                    onSaved={(v) => setEntries((prev) => prev.map((e) => (e._id === c._id ? { ...e, blacklistAssignedTo: v } : e)))}
                  />
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    {c.blacklistStatus === "candidate" && (
                      <button
                        onClick={() => handleConfirm(c._id)}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Confirm
                      </button>
                    )}
                    <button onClick={() => handleRemove(c._id)} className="text-xs text-zinc-500 hover:text-red-400">
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500">
                  No clients in the Blacklist
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded-lg bg-zinc-800 px-4 py-2 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="rounded-lg bg-zinc-800 px-4 py-2 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ClientDetailModal clientId={detailId} onClose={() => setDetailId(null)} />
      <AddToBlacklistModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} onAdded={load} />
    </div>
  )
}
