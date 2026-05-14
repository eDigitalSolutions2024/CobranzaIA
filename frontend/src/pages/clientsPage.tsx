const clients = [

  {
    id: 1,
    name: "Abarrotera De Valles, S.A. De C.V.",
    debt: "$182,000",
    status: "Pendiente",
    risk: "Alto",
    channel: "WhatsApp",
    lastContact: "Hace 5 min",
  },

  {
    id: 2,
    name: "Absormex Cmpc Tissue S.A. De C.V.",
    debt: "$95,000",
    status: "Promesa",
    risk: "Medio",
    channel: "Email",
    lastContact: "Hace 20 min",
  },

  {
    id: 3,
    name: "Aerolineas Ejecutivas S.A. De C.V.",
    debt: "$420,000",
    status: "Escalado",
    risk: "Alto",
    channel: "Llamada",
    lastContact: "Hace 1 hora",
  },

  {
    id: 4,
    name: "Alianza Estratégica Portuaria, S.A. De C.V.",
    debt: "$68,000",
    status: "Pagado",
    risk: "Bajo",
    channel: "SMS",
    lastContact: "Ayer",
  },

  {
    id: 5,
    name: "Alpezzi Chocolate S.A. De C.V.",
    debt: "$210,000",
    status: "Pendiente",
    risk: "Medio",
    channel: "WhatsApp",
    lastContact: "Hace 15 min",
  },

  {
    id: 6,
    name: "Autotransportes Pilot, S.A. De C.V.",
    debt: "$510,000",
    status: "Escalado",
    risk: "Alto",
    channel: "Llamada",
    lastContact: "Hace 2 horas",
  },

  {
    id: 7,
    name: "Axity Mexico Sa De Cv",
    debt: "$74,000",
    status: "Promesa",
    risk: "Bajo",
    channel: "Email",
    lastContact: "Hace 40 min",
  },

  {
    id: 8,
    name: "Baja Ferries, S.A.P.I. De C.V.",
    debt: "$310,000",
    status: "Pendiente",
    risk: "Alto",
    channel: "WhatsApp",
    lastContact: "Hace 8 min",
  },

]

export default function ClientsPage() {

  const getRiskColor = (risk: string) => {

    switch (risk) {

      case "Alto":
        return "bg-red-500/10 text-red-400"

      case "Medio":
        return "bg-yellow-500/10 text-yellow-400"

      default:
        return "bg-green-500/10 text-green-400"
    }
  }

  const getStatusColor = (status: string) => {

    switch (status) {

      case "Pagado":
        return "bg-green-500/10 text-green-400"

      case "Escalado":
        return "bg-red-500/10 text-red-400"

      case "Promesa":
        return "bg-yellow-500/10 text-yellow-400"

      default:
        return "bg-blue-500/10 text-blue-400"
    }
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-4xl font-bold">
            Clientes
          </h1>

          <p className="mt-2 text-zinc-400">
            Gestión inteligente de cobranza
          </p>

        </div>

        <button className="
          rounded-xl bg-blue-600
          px-5 py-3
          font-medium
          hover:bg-blue-500
          transition
        ">
          Nuevo cliente
        </button>

      </div>

      {/* TABLE */}

      <div className="
        rounded-2xl border border-zinc-800
        bg-zinc-900/50
        p-6
      ">

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead>

              <tr className="
                border-b border-zinc-800
                text-left
              ">

                <th className="pb-4 text-sm text-zinc-500">
                  Cliente
                </th>

                <th className="pb-4 text-sm text-zinc-500">
                  Deuda
                </th>

                <th className="pb-4 text-sm text-zinc-500">
                  Estado
                </th>

                <th className="pb-4 text-sm text-zinc-500">
                  Riesgo IA
                </th>

                <th className="pb-4 text-sm text-zinc-500">
                  Canal
                </th>

                <th className="pb-4 text-sm text-zinc-500">
                  Último contacto
                </th>

              </tr>

            </thead>

            <tbody>

              {clients.map((client) => (

                <tr
                  key={client.id}
                  className="border-b border-zinc-800"
                >

                  <td className="py-5 font-medium">
                    {client.name}
                  </td>

                  <td className="py-5">
                    {client.debt}
                  </td>

                  <td className="py-5">

                    <span className={`
                      rounded-full
                      px-3 py-1
                      text-sm
                      ${getStatusColor(client.status)}
                    `}>
                      {client.status}
                    </span>

                  </td>

                  <td className="py-5">

                    <span className={`
                      rounded-full
                      px-3 py-1
                      text-sm
                      ${getRiskColor(client.risk)}
                    `}>
                      {client.risk}
                    </span>

                  </td>

                  <td className="py-5 text-zinc-300">
                    {client.channel}
                  </td>

                  <td className="py-5 text-zinc-500">
                    {client.lastContact}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  )
}