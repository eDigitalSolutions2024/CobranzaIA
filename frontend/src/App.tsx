import MainLayout from "./layouts/MainLayout"
import KpiCard from "./components/KpiCard"
import RecoveryChart from "./components/RecoveryChart"
import RecentActivity from "./components/RecentActivity"
import ClientsTable from "./components/ClientsTable"

export default function App() {
  return (
    <MainLayout>

      <div>
        
        <h1 className="text-4xl font-bold">
          Dashboard
        </h1>

        <p className="mt-2 text-zinc-400">
          Bienvenido de nuevo.
        </p>

      </div>

      {/* KPI CARDS */}

      <div className="
        mt-8 grid gap-6
        md:grid-cols-2
        xl:grid-cols-4
      ">
        
        <KpiCard
          title="Cobranza recuperada"
          value="$248,000"
          change="+12%"
        />

        <KpiCard
          title="Clientes activos"
          value="1,284"
          change="+4%"
        />

        <KpiCard
          title="Promesas de pago"
          value="328"
          change="+18%"
        />

        <KpiCard
          title="Tasa de respuesta"
          value="82%"
          change="+7%"
        />

      </div>

      {/* CHARTS + ACTIVITY */}

      <div className="
        mt-6 grid gap-6
        xl:grid-cols-3
      ">
        
        <div className="xl:col-span-2">
          <RecoveryChart />
        </div>

        <RecentActivity />

      </div>

      {/* CLIENTS TABLE */}

      <div className="mt-6">
        <ClientsTable />
      </div>

    </MainLayout>
  )
}