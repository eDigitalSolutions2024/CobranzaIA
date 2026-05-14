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

export default function ClientsTable({ clients }: Props) {

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

  return (
    <div className="
      rounded-2xl border border-zinc-800
      bg-zinc-900/50
      p-6
    ">

      <div className="mb-6">

        <h2 className="text-xl font-semibold">
          Clientes recientes
        </h2>

        <p className="text-sm text-zinc-400">
          Seguimiento de cobranza inteligente
        </p>

      </div>

      <div className="overflow-x-auto">

        <table className="w-full">

          <thead>

            <tr className="border-b border-zinc-800 text-left">

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

            {clients.map((client, index) => (

              <tr
                key={index}
                className="border-b border-zinc-800"
              >

                <td className="py-5 font-medium">
                  {client.nombre}
                </td>

                <td className="py-5">
                  {client.deuda}
                </td>

                <td className="py-5">

                  <span className="
                    rounded-full bg-blue-500/10
                    px-3 py-1 text-sm
                    text-blue-400
                  ">
                    {client.estado}
                  </span>

                </td>

                <td className="py-5">

                  <span className={`
                    rounded-full
                    px-3 py-1
                    text-sm
                    ${getRiskColor(client.riesgo)}
                  `}>
                    {client.riesgo}
                  </span>

                </td>

                <td className="py-5 text-zinc-300">
                  {client.canal}
                </td>

                <td className="py-5 text-zinc-500">
                  {client.ultimoContacto}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  )
}