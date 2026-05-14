import { clients } from "../mock/clients"

export default function ClientsTable() {
  return (
    <div className="
      rounded-2xl border border-zinc-800
      bg-zinc-900/50
      p-6
    ">
      
      <div className="mb-6 flex items-center justify-between">
        
        <div>
          <h2 className="text-xl font-semibold">
            Clientes recientes
          </h2>

          <p className="text-sm text-zinc-400">
            Seguimiento de cobranza inteligente
          </p>
        </div>

        <button className="
          rounded-xl bg-blue-500
          px-4 py-2
          text-sm font-medium
          hover:bg-blue-600
        ">
          Nuevo cliente
        </button>

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
                  <span className="
                    rounded-full bg-blue-500/10
                    px-3 py-1 text-sm
                    text-blue-400
                  ">
                    {client.status}
                  </span>
                </td>

                <td className="py-5">
                  <span className="
                    rounded-full bg-red-500/10
                    px-3 py-1 text-sm
                    text-red-400
                  ">
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
  )
}