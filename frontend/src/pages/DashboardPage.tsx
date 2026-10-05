import { useEffect, useMemo, useState } from "react"
import KpiCard from "../components/KpiCard"
import RecoveryChart from "../components/RecoveryChart"
import RecentActivity from "../components/RecentActivity"
import ClientsTable from "../components/ClientsTable"
import NewClientModal from "../components/NewClientModal"
import ReportFilters, { EMPTY_REPORT_FILTERS, type ReportFilterValue } from "../components/ReportFilters"
import BlacklistSection from "../components/BlacklistSection"
import { getClientsPage } from "../services/clients"
import { getMetrics } from "../services/metrics"
import { CircleDollarSign, UsersRound, CircleCheckBig,
        ArrowUpNarrowWide, TriangleAlert, Siren,SquareCheckBig } from "lucide-react"
import VoiceViewCall from "../components/VoiceViewCall"

const PAGE_SIZE = 25

export default function DashboardPage() {
  const [openModal, setOpenModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [totalClients, setTotalClients] = useState(0)
  const [rawClients, setRawClients] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [reportFilters, setReportFilters] = useState<ReportFilterValue>(EMPTY_REPORT_FILTERS)

  // KPIs y gráficas vienen agregados del servidor sobre TODOS los clientes (con los filtros
  // aplicados); la tabla pide una página a la vez — nada se recorta a un número fijo.
  async function loadAll() {
    try {
      const [pageData, metricsData] = await Promise.all([
        getClientsPage("recent", page, PAGE_SIZE, reportFilters),
        getMetrics(reportFilters),
      ])

      setRawClients(pageData.clients)
      setTotalClients(pageData.total)
      setPages(pageData.pages)
      setMetrics(metricsData)
    } catch (error) {
      console.log(error)
    } finally {
      setLoading(false)
    }
  }

  const clients = useMemo(() => {
    return rawClients
      .map((client: any) => ({
        nombre: client.name,
        needsAdmin: Boolean(client.needsAdmin),
        deuda: `$${Number(client.debt).toLocaleString("en-US")}`,
        estado: client.status ?? "pending",
        riesgo: client.risk,
        canal: client.channel,
        ultimoContacto: client.lastContactAt
          ? new Date(client.lastContactAt).toLocaleDateString("en-US")
          : "—",
      }))
  }, [rawClients])

  // Al cambiar filtros se vuelve a la primera página
  function changeFilters(value: ReportFilterValue) {
    setReportFilters(value)
    setPage(1)
  }

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, reportFilters])

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
              : `$${Number(metrics?.totalDebt || 0 ,).toLocaleString("en-US",{
                currency: "USD",
                maximumFractionDigits: 0,
              })} USD`
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
          <div className="rounded-xl border border-red-500 bg-[var(--bg-main)] p-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">High Risk</h2>
              <h2 className="text-3xl font-bold text-[var(--danger)] mt-1">
                {metrics.riskBreakdown?.high ?? 0}
              </h2>
              <Siren color="var(--danger)" size={50} />
            </div>
          </div>
          <div className="rounded-xl border border-yellow-500 bg-[var(--bg-main)] p-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Medium Risk</h2>
              <h2 className="text-3xl font-bold text-yellow-400 mt-1">
                {metrics.riskBreakdown?.medium ?? 0}
              </h2>
              <TriangleAlert color="var(--warning)" size={50} />
            </div>
          </div>
          <div className="rounded-xl border border-green-500 bg-[var(--bg-main)] p-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Low Risk</h2>
              <h2 className="text-3xl font-bold text-green-400 mt-1">
                {metrics.riskBreakdown?.low ?? 0}
              </h2>
              <SquareCheckBig color="var(--success)" size={50} />
            </div>
          </div>
        </div>
      )}

      {/* Blacklist de clientes morosos con negativa de pago */}
      <div className="mt-6">
        <BlacklistSection />
      </div>

      {/* Voice Calls Overview + Weekly Recovery */}
      {metrics?.callStats && (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
         <VoiceViewCall callStats={metrics.callStats} />
          {/* =========================
              WEEKLY RECOVERY
          ========================== */}
          <div className="
            min-w-0
            rounded-xl
            border
            border-[var(--border)]
            bg-[var(--bg-card)]
            p-5
          ">
            <RecoveryChart weeks={metrics.promiseWeekly ?? []} />

          </div>
      </div>
    )}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <div className="mt-6">

        <div className="mb-4">
          <ReportFilters value={reportFilters} onChange={changeFilters} />
        </div>
        <ClientsTable clients={clients} />
        <div className="mt-3 flex items-center justify-between text-sm text-zinc-400">
          <span>
            {totalClients === 0
              ? "0 customers"
              : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalClients)} of ${totalClients} customers`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span>Page {page} of {pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setOpenModal(true)}
            className="bg-brand hover:bg-brand-light text-white px-4 py-2 rounded-xl mt-5"
          >
            New client
          </button>
        </div>
      </div>

      <NewClientModal
        isOpen={openModal}
        onClose={() => setOpenModal(false)}
        onSave={handleSaveClient}
      />
        </div>
        <div className="min-w-0">
          <RecentActivity />
        </div>
      </div>
    </>
  )
}
