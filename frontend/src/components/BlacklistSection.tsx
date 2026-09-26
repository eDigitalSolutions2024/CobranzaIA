import { useEffect, useState } from "react"
import { getBlacklist, updateBlacklistEntry, searchClients, type BlacklistFilters } from "../services/blacklist"
import ClientDetailModal from "./ClientDetailModal"

const STATUS_LABEL: Record<string, string> = { candidate: "Candidate", confirmed: "Confirmed" }
const STATUS_COLOR: Record<string, string> = {
  candidate: "bg-yellow-500/10 text-yellow-400",
  confirmed: "bg-red-500/10 text-red-400",
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

// Contenedor "Blacklist" dentro del Dashboard (ver tarjeta "Implementar Blacklist de
// Clientes Morosos") — clientes con negativa de pago detectada por la IA (voz o
// WhatsApp, marcados como 'candidate' vía Client.blacklistStatus) o confirmados por un
// administrador. El historial de llamadas/mensajes reutiliza el ClientDetailModal que
// ya existe, en vez de construir una vista de historial aparte.
export default function BlacklistSection() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<BlacklistFilters["status"]>("all")
  const [search, setSearch] = useState("")
  const [minDaysOverdue, setMinDaysOverdue] = useState("")
  const [detailId, setDetailId] = useState<string | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)

  async function load() {
    try {
      const data = await getBlacklist({ status, search, minDaysOverdue })
      setEntries(data)
    } catch {
      // noop — se reintenta en el próximo poll
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, minDaysOverdue])

  async function handleConfirm(clientId: string) {
    await updateBlacklistEntry(clientId, { blacklistStatus: "confirmed" })
    load()
  }

  async function handleRemove(clientId: string) {
    if (!confirm("Remove this client from the Blacklist?")) return
    await updateBlacklistEntry(clientId, { blacklistStatus: "none" })
    load()
  }

  return (
    <div className="rounded-2xl border border-red-900/40 bg-[var(--bg-main)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Blacklist</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Clients with a payment refusal detected by the AI or added manually</p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/40 transition-colors"
        >
          + Add client
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client..."
          className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        />
        <input
          type="number"
          value={minDaysOverdue}
          onChange={(e) => setMinDaysOverdue(e.target.value)}
          placeholder="Min. days overdue"
          className="w-36 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        />
        <div className="flex gap-2">
          {(["all", "candidate", "confirmed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                status === s ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="pb-3 text-xs text-zinc-500">Client</th>
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
            {entries.map((c) => (
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

      <ClientDetailModal clientId={detailId} onClose={() => setDetailId(null)} />
      <AddToBlacklistModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} onAdded={load} />
    </div>
  )
}
