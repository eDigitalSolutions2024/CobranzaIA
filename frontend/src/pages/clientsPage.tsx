import { useEffect, useState } from "react"
import { getClients } from "../services/clients"
import NewClientModal from "../components/NewClientModal"

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
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client._id} className="border-b border-zinc-800">

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

                  </tr>
                ))}

                {clients.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500">
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
    </>
  )
}
