import { useEffect, useState } from "react"
import { getClients, exportClientsExcel } from "../services/clients"
import { api } from "../services/api"
import NewClientModal from "../components/NewClientModal"
import ClientDetailModal from "../components/ClientDetailModal"
import ImportClientsModal from "../components/ImportClientsModal"
import { ChevronDown, ChevronUp } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  contacted: "Contacted",
  negotiating: "Negotiating",
  promised: "Promise",
  paid: "Paid",
  no_response: "No response",
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-blue-500/10 text-blue-400",
  contacted: "bg-purple-500/10 text-purple-400",
  negotiating: "bg-orange-500/10 text-orange-400",
  promised: "bg-yellow-500/10 text-yellow-400",
  paid: "bg-green-500/10 text-green-400",
  no_response: "bg-zinc-500/10 text-zinc-400",
}

const RISK_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

const RISK_COLOR: Record<string, string> = {
  low: "bg-green-500/10 text-green-400",
  medium: "bg-yellow-500/10 text-yellow-400",
  high: "bg-red-500/10 text-red-400",
}

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [openModal, setOpenModal] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    try {
      await exportClientsExcel()
    } catch (error) {
      console.log(error)
      alert("Error exporting Excel file")
    } finally {
      setExporting(false)
    }
  }

  async function handleCall(clientId: string) {
    setCallingId(clientId)
    try {
      await api("/voice/outbound", {
        method: "POST",
        body: JSON.stringify({ clientId }),
      })
    } catch {
      alert("Error starting the call")
    } finally {
      setCallingId(null)
    }
  }
  async function onClickAccordion(id: string) {
    setExpandedClientId((prev) => (prev === id ? null : id))
  }

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    try {
      const data = await getClients()
      setClients(data)
    } catch (error) {
      console.log(error)
    }
  }

  return (
    <>
      <div className="space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Clients</h1>
            <p className="mt-2 text-zinc-400">Smart collection management</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setImportOpen(true)}
              className="rounded-xl bg-zinc-800 px-5 py-3 font-medium hover:bg-zinc-700 cursor-pointer"
            >
              Import Excel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-xl bg-zinc-800 px-5 py-3 font-medium hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
            <button
              onClick={() => setOpenModal(true)}
              className="rounded-xl bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500 cursor-pointer"
            >
              New client
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-4 text-sm text-zinc-500">Customer</th>
                  <th className="pb-4 text-sm text-zinc-500">Phone</th>
                  <th className="pb-4 text-sm text-zinc-500">USD Amount</th>
                  <th className="pb-4 text-sm text-zinc-500">Risk</th>
                  <th className="pb-4 text-sm text-zinc-500">Last contact</th>
                  <th className="pb-4 text-sm text-zinc-500">Payment Promise</th>
                  <th className="pb-4 text-sm text-zinc-500">Classification</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const expanded = expandedClientId === client._id;
                  return(
                  <>
                  <tr
                    key={client._id}
                    className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors"
                  >
                    
                    <td onClick={() => setDetailId(client._id)} className="py-4 font-medium cursor-pointer">{client.name}</td>
                    <td className="py-4 text-zinc-400">{client.phone}</td>
                    <td className="py-4 text-zinc-300">{client.agingDays ?? "—"}</td>
                    <td className="py-4 text-zinc-300">
                      
                      {client.usdAmount != null
                        ? `$${Number(client.usdAmount).toLocaleString("en-US")}`
                        : "—"}
                    </td>
                    <td className="py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-sm ${
                          RISK_COLOR[client.risk] || "bg-zinc-500/10 text-zinc-400"
                        }`}
                      >
                        {RISK_LABEL[client.risk] || client.risk}
                      </span>
                    </td>
                    <td className="py-4 text-zinc-500">
                      {client.lastContactAt
                        ? new Date(client.lastContactAt).toLocaleDateString("en-US")
                        : "—"}
                    </td>
                    <td className="py-4">
                      {client.lastIntent && client.lastIntent !== "general" && (
                        <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                          {client.lastIntent}
                        </span>
                      )}
                    </td>
                       <td>
                    </td>
                    <td>
                      <button
                      onClick={() => onClickAccordion(client._id)}
                      className="text-blue-400 hover:text-blue-300 flex items center align-center justify-center gap-2 cursor-pointer"
                    >
                      {expanded ? (
                      <>
                        <p>Hide</p>
                        <ChevronDown size={24} />
                      </>
                    ) : (
                      <>
                        <p>Show</p>
                        <ChevronUp size={24} />                      
                      </>
                    )}
                    </button>
                    </td>
                    <td className="py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCall(client._id) }}
                        disabled={callingId === client._id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {callingId === client._id ? (
                          <>
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Calling...
                          </>
                        ) : (
                          <>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                            </svg>
                            Call
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                 {expanded && (
                  <tr className="bg-zinc-950/50">
                    <td colSpan={9} className="p-5">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Country
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Customer ID
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Team
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Team Leader
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Collector
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Invoice #
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Create Date
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Due Date
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Aging Bucket
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Loan / Lease
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Debt
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Status
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Channel
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Contact
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Next Action
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Payment Promise
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Date Promise
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                                Intent
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            <tr className="border-b border-zinc-800">
                              <td className="px-4 py-3">{client.country || "—"}</td>

                              <td className="px-4 py-3">{client.customerId || "—"}</td>

                              <td className="px-4 py-3">{client.team || "—"}</td>

                              <td className="px-4 py-3">{client.teamLeader || "—"}</td>

                              <td className="px-4 py-3">{client.collector || "—"}</td>

                              <td className="px-4 py-3">{client.invoiceNumber || "—"}</td>

                              <td className="px-4 py-3">
                                {client.createDate
                                  ? new Date(client.createDate).toLocaleDateString("en-US")
                                  : "—"}
                              </td>

                              <td className="px-4 py-3">
                                {client.dueDate
                                  ? new Date(client.dueDate).toLocaleDateString("en-US")
                                  : "—"}
                              </td>

                              <td className="px-4 py-3">{client.agingDays ?? "—"}</td>

                              <td className="px-4 py-3">{client.loanLease || "—"}</td>

                              <td className="px-4 py-3">
                                {client.debt != null
                                  ? `$${Number(client.debt).toLocaleString("en-US")}`
                                  : "—"}
                              </td>

                              <td className="px-4 py-3">
                                {STATUS_LABEL[client.status] || client.status || "—"}
                              </td>

                              <td className="px-4 py-3">{client.channel || "—"}</td>

                              <td className="px-4 py-3">{client.contact || "—"}</td>

                              <td className="px-4 py-3">{client.nextAction || "—"}</td>

                              <td className="px-4 py-3">
                                {client.paymentPromiseAmount != null
                                  ? `$${Number(client.paymentPromiseAmount).toLocaleString(
                                      "en-US"
                                    )}`
                                  : "—"}
                              </td>

                              <td className="px-4 py-3">
                                {client.datePromise
                                  ? new Date(client.datePromise).toLocaleDateString("en-US")
                                  : "—"}
                              </td>

                              <td className="px-4 py-3">
                                {client.lastIntent || "—"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                  </>
                  ) 
             
                })}

                {clients.length === 0 && (
                  <tr>
                    <td colSpan={24} className="py-8 text-center text-zinc-500">
                      No clients registered
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <NewClientModal
        isOpen={openModal}
        onClose={() => setOpenModal(false)}
        onSave={async () => {
          await loadClients()
          setOpenModal(false)
        }}
      />

      <ClientDetailModal
        clientId={detailId}
        onClose={() => setDetailId(null)}
      />

      <ImportClientsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={loadClients}
      />
    </>
  )
}
