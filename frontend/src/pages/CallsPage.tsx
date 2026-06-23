import { useEffect, useState } from "react"
import { getCalls } from "../services/calls"

const STATUS_LABEL: Record<string, string> = {
  in_progress: "En curso",
  completed: "Completada",
  failed: "Fallida",
  requires_human: "Requiere asesor",
}

const STATUS_COLOR: Record<string, string> = {
  in_progress: "bg-blue-500/10 text-blue-400",
  completed: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
  requires_human: "bg-orange-500/10 text-orange-400",
}

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  async function load() {
    try {
      const data = await getCalls()
      setCalls(data)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Llamadas</h1>
        <p className="mt-2 text-zinc-400">Historial de llamadas de cobranza</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="pb-4 text-sm text-zinc-500">Cliente</th>
                <th className="pb-4 text-sm text-zinc-500">Teléfono</th>
                <th className="pb-4 text-sm text-zinc-500">Fecha</th>
                <th className="pb-4 text-sm text-zinc-500">Estado</th>
                <th className="pb-4 text-sm text-zinc-500">Promesa de pago</th>
                <th className="pb-4 text-sm text-zinc-500">Transcript</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <>
                  <tr key={call._id} className="border-b border-zinc-800">
                    <td className="py-4 font-medium">
                      {call.clientId?.name ?? <span className="text-zinc-500">Desconocido</span>}
                    </td>

                    <td className="py-4 text-zinc-400">{call.phone}</td>

                    <td className="py-4 text-zinc-400 text-sm">
                      {new Date(call.createdAt).toLocaleString("es-MX")}
                    </td>

                    <td className="py-4">
                      <span className={`rounded-full px-3 py-1 text-sm ${STATUS_COLOR[call.status] ?? "bg-zinc-500/10 text-zinc-400"}`}>
                        {STATUS_LABEL[call.status] ?? call.status}
                      </span>
                    </td>

                    <td className="py-4">
                      {call.promiseDate ? (
                        <div className="text-sm">
                          <span className="text-emerald-400 font-medium">
                            ${Number(call.amount).toLocaleString("es-MX")}
                          </span>
                          <span className="text-zinc-500 ml-2">
                            {new Date(call.promiseDate).toLocaleDateString("es-MX")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-sm">—</span>
                      )}
                    </td>

                    <td className="py-4">
                      <button
                        onClick={() => setExpanded(expanded === call._id ? null : call._id)}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        {expanded === call._id ? "Ocultar" : `Ver (${call.transcript?.length ?? 0} turnos)`}
                      </button>
                    </td>
                  </tr>

                  {expanded === call._id && (
                    <tr key={`${call._id}-transcript`} className="border-b border-zinc-800">
                      <td colSpan={6} className="pb-4 px-2">
                        <div className="rounded-xl bg-zinc-950 p-4 space-y-3 max-h-72 overflow-y-auto">
                          {call.transcript?.map((turn: any, i: number) => (
                            <div key={i} className={`flex gap-3 ${turn.role === "assistant" ? "" : "flex-row-reverse"}`}>
                              <div className={`text-xs px-3 py-2 rounded-xl max-w-lg ${
                                turn.role === "assistant"
                                  ? "bg-zinc-800 text-zinc-200"
                                  : "bg-blue-600/20 text-blue-300"
                              }`}>
                                <span className="block text-[10px] mb-1 opacity-50">
                                  {turn.role === "assistant" ? "IA" : "Cliente"}
                                </span>
                                {turn.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}

              {calls.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    Sin llamadas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
