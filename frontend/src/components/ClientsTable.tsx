interface Client {
  nombre: string
  deuda: string
  estado: string
  riesgo: string
  canal: string
  ultimoContacto: string
}

interface Props {
  clients: Client[]
}

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

export default function ClientsTable({ clients }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">

      <div className="mb-6">
        <h2 className="text-xl font-semibold">Clientes recientes</h2>
        <p className="text-sm text-zinc-400">Seguimiento de cobranza inteligente</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="pb-4 text-sm text-zinc-500">Cliente</th>
              <th className="pb-4 text-sm text-zinc-500">Deuda</th>
              <th className="pb-4 text-sm text-zinc-500">Estado</th>
              <th className="pb-4 text-sm text-zinc-500">Riesgo IA</th>
              <th className="pb-4 text-sm text-zinc-500">Canal</th>
              <th className="pb-4 text-sm text-zinc-500">Último contacto</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, index) => (
              <tr key={index} className="border-b border-zinc-800">

                <td className="py-4 font-medium">{client.nombre}</td>

                <td className="py-4">{client.deuda}</td>

                <td className="py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      STATUS_COLOR[client.estado] || "bg-blue-500/10 text-blue-400"
                    }`}
                  >
                    {STATUS_LABEL[client.estado] || client.estado}
                  </span>
                </td>

                <td className="py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      RISK_COLOR[client.riesgo] || "bg-zinc-500/10 text-zinc-400"
                    }`}
                  >
                    {RISK_LABEL[client.riesgo] || client.riesgo}
                  </span>
                </td>

                <td className="py-4 text-zinc-300">{client.canal}</td>

                <td className="py-4 text-zinc-500">{client.ultimoContacto}</td>

              </tr>
            ))}

            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  Sin clientes registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
