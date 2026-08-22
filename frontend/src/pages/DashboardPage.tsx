import { useEffect, useState } from "react"
import KpiCard from "../components/KpiCard"
import RecoveryChart from "../components/RecoveryChart"
import RecentActivity from "../components/RecentActivity"
import ClientsTable from "../components/ClientsTable"
import NewClientModal from "../components/NewClientModal"
import { getClients } from "../services/clients"
import { getMetrics } from "../services/metrics"
import { CircleDollarSign, UsersRound, CircleCheckBig, ArrowUpNarrowWide } from "lucide-react"
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
        deuda: `$${Number(client.debt).toLocaleString("en-US")}`,
        estado: client.status ?? "pending",
        riesgo: client.risk,
        canal: client.channel,
        ultimoContacto: client.lastContactAt
          ? new Date(client.lastContactAt).toLocaleDateString("en-US")
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
        <h2 className="mt-2 text-white">Welcome back</h2>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total active debt"
          icon={CircleDollarSign}
          colorIcon="var(--brand-main)"
          size={50}
          value={
            loading
              ? "..."
              : `$${Number(metrics?.totalDebt || 0).toLocaleString("en-US")}`
          }
          change=""
        />
         

        <KpiCard
          title="Active clients"
          icon={UsersRound}
          colorIcon="var(--brand-cyan)"
          size={50}
          value={loading ? "..." : String(metrics?.activeClients ?? 0)}
          change=""
        />

        <KpiCard
          title="Payment promises"
          icon={CircleCheckBig}
          colorIcon="var(--success)"
          size={50}
          value={loading ? "..." : String(metrics?.paymentPromises ?? 0)}
          change=""
        />

        <KpiCard
          title="Response rate"
          icon={ArrowUpNarrowWide}
          colorIcon="var(--brand-purple)"
          size={50}
          value={loading ? "..." : `${metrics?.responseRate ?? 0}%`}
          change=""
        />
      </div>

      {/* Risk breakdown */}
      {metrics && (
        <div className="mt-4 grid gap-4 grid-cols-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
            <p className="text-sm text-white">High Risk</p>
            <p className="text-2xl font-bold text-red-400 mt-1">
              {metrics.riskBreakdown?.high ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-center">
            <p className="text-sm text-white">Medium Risk</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">
              {metrics.riskBreakdown?.medium ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
            <p className="text-sm text-white">Low Risk</p>
            <p className="text-2xl font-bold text-green-400 mt-1">
              {metrics.riskBreakdown?.low ?? 0}
            </p>
          </div>
        </div>
      )}

      {/* Voice call metrics */}
      {metrics?.callStats && (
        <div className="mt-4">
          <h2 className="text-sm font-medium text-white mb-3 uppercase tracking-wider">Voice calls</h2>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4 text-center">
              <p className="text-sm text-white">Total calls</p>
              <p className="text-2xl font-bold text-white mt-1">{metrics.callStats.total}</p>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
              <p className="text-sm text-white">Completed</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{metrics.callStats.completed ?? 0}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
              <p className="text-sm text-white">With promise</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{metrics.callStats.withPromise}</p>
            </div>
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-center">
              <p className="text-sm text-white">Require agent</p>
              <p className="text-2xl font-bold text-orange-400 mt-1">{metrics.callStats.requires_human ?? 0}</p>
            </div>
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
            className="bg-brand hover:bg-brand-light text-white px-4 py-2 rounded-xl"
          >
            New client
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
