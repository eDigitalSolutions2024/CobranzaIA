import { useEffect, useState } from "react"
import { getClients } from "../services/clients"
import { api } from "../services/api"
import NewClientModal from "../components/NewClientModal"
import ClientDetailModal from "../components/ClientDetailModal"

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  contacted: "Contactado",
  negotiating: "Negociando",
  promised: "Promesa",
  paid: "Pagado",
  no_response: "Sin respuesta",
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
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
}

const RISK_COLOR: Record<string, string> = {
  low: "bg-green-500/10 text-green-400",
  medium: "bg-yellow-500/10 text-yellow-400",
  high: "bg-red-500/10 text-red-400",
}

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [openModal, setOpenModal] = useState(false)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  async function handleCall(clientId: string) {
    setCallingId(clientId)
    try {
      await api("/voice/outbound", {
        method: "POST",
        body: JSON.stringify({ clientId }),
      })
    } catch {
      alert("Error al iniciar la llamada")
    } finally {
      setCallingId(null)
    }
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
            <h1 className="text-4xl font-bold">Clientes</h1>
            <p className="mt-2 text-zinc-400">Gestión inteligente de cobranza</p>
          </div>
          <button
            onClick={() => setOpenModal(true)}
            className="rounded-xl bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500"
          >
            Nuevo cliente
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-4 text-sm text-zinc-500">Cliente</th>
                  <th className="pb-4 text-sm text-zinc-500">Teléfono</th>
                  <th className="pb-4 text-sm text-zinc-500">Deuda</th>
                  <th className="pb-4 text-sm text-zinc-500">Estado</th>
                  <th className="pb-4 text-sm text-zinc-500">Riesgo IA</th>
                  <th className="pb-4 text-sm text-zinc-500">Canal</th>
                  <th className="pb-4 text-sm text-zinc-500">Último contacto</th>
                  <th className="pb-4 text-sm text-zinc-500">Intención</th>
                  <th className="pb-4 text-sm text-zinc-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client._id}
                    className="border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/40 transition-colors"
                    onClick={() => setDetailId(client._id)}
                  >

                    <td className="py-4 font-medium">{client.name}</td>

                    <td className="py-4 text-zinc-400">{client.phone}</td>

                    <td className="py-4">
                      ${Number(client.debt).toLocaleString("es-MX")}
                    </td>

                    <td className="py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-sm ${
                          STATUS_COLOR[client.status] || "bg-blue-500/10 text-blue-400"
                        }`}
                      >
                        {STATUS_LABEL[client.status] || client.status}
                      </span>
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

                    <td className="py-4 text-zinc-300">{client.channel}</td>

                    <td className="py-4 text-zinc-500">
                      {client.lastContactAt
                        ? new Date(client.lastContactAt).toLocaleDateString("es-MX")
                        : "—"}
                    </td>

                    <td className="py-4">
                      {client.lastIntent && client.lastIntent !== "general" && (
                        <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                          {client.lastIntent}
                        </span>
                      )}
                    </td>

                    <td className="py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCall(client._id) }}
                        disabled={callingId === client._id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                      >
                        {callingId === client._id ? (
                          <>
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Llamando...
                          </>
                        ) : (
                          <>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                            </svg>
                            Llamar
                          </>
                        )}
                      </button>
                    </td>

                  </tr>
                ))}

                {clients.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-zinc-500">
                      Sin clientes registrados
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
    </>
  )
}
