import { useEffect, useState } from "react"
import KpiCard from "../components/KpiCard"
import RecoveryChart from "../components/RecoveryChart"
import RecentActivity from "../components/RecentActivity"
import ClientsTable from "../components/ClientsTable"
import NewClientModal from "../components/NewClientModal"
import { getClients } from "../services/clients"
import { getMetrics } from "../services/metrics"

export default function DashboardPage() {
  const [openModal, setOpenModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>(null)

  async function loadAll() {
    try {
      setLoading(true)
      const [clientsData, metricsData] = await Promise.all([
        getClients(),
        getMetrics(),
      ])

      const formatted = clientsData.map((client: any) => ({
        nombre: client.name,
        deuda: `$${Number(client.debt).toLocaleString("es-MX")}`,
        estado: client.status ?? "pending",
        riesgo: client.risk,
        canal: client.channel,
        ultimoContacto: client.lastContactAt
          ? new Date(client.lastContactAt).toLocaleDateString("es-MX")
          : "—",
      }))

      setClients(formatted)
      setMetrics(metricsData)
    } catch (error) {
      console.log(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()

    const interval = setInterval(loadAll, 30000)
    return () => clearInterval(interval)
  }, [])

  async function handleSaveClient() {
    await loadAll()
    setOpenModal(false)
  }

  return (
    <>
      <div>
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="mt-2 text-zinc-400">Bienvenido de nuevo.</p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Deuda total activa"
          value={
            loading
              ? "..."
              : `$${Number(metrics?.totalDebt || 0).toLocaleString("es-MX")}`
          }
          change=""
        />

        <KpiCard
          title="Clientes activos"
          value={loading ? "..." : String(metrics?.activeClients ?? 0)}
          change=""
        />

        <KpiCard
          title="Promesas de pago"
          value={loading ? "..." : String(metrics?.paymentPromises ?? 0)}
          change=""
        />

        <KpiCard
          title="Tasa de respuesta"
          value={loading ? "..." : `${metrics?.responseRate ?? 0}%`}
          change=""
        />
      </div>

      {/* Desglose de riesgo */}
      {metrics && (
        <div className="mt-4 grid gap-4 grid-cols-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
            <p className="text-sm text-zinc-400">Riesgo Alto</p>
            <p className="text-2xl font-bold text-red-400 mt-1">
              {metrics.riskBreakdown?.high ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-center">
            <p className="text-sm text-zinc-400">Riesgo Medio</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">
              {metrics.riskBreakdown?.medium ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
            <p className="text-sm text-zinc-400">Riesgo Bajo</p>
            <p className="text-2xl font-bold text-green-400 mt-1">
              {metrics.riskBreakdown?.low ?? 0}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecoveryChart />
        </div>
        <RecentActivity />
      </div>

      <div className="mt-6">
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setOpenModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl"
          >
            Nuevo cliente
          </button>
        </div>

        <ClientsTable clients={clients} />
      </div>

      <NewClientModal
        isOpen={openModal}
        onClose={() => setOpenModal(false)}
        onSave={handleSaveClient}
      />
    </>
  )
}
