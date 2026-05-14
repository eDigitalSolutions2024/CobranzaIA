import { useState } from "react"

import KpiCard from "../components/KpiCard"
import RecoveryChart from "../components/RecoveryChart"
import RecentActivity from "../components/RecentActivity"
import ClientsTable from "../components/ClientsTable"
import NewClientModal from "../components/NewClientModal"

export default function DashboardPage() {

  const [openModal, setOpenModal] = useState(false)

  const [clients, setClients] = useState([
    {
      nombre: "Juan Pérez",
      deuda: "$12,500",
      estado: "Pendiente",
      riesgo: "Alto",
      canal: "WhatsApp",
      ultimoContacto: "Hace 5 min",
    },

    {
      nombre: "María López",
      deuda: "$8,200",
      estado: "Promesa",
      riesgo: "Medio",
      canal: "SMS",
      ultimoContacto: "Hace 20 min",
    },
  ])

  const handleSaveClient = (client: any) => {

    setClients([
      ...clients,

      {
        nombre: client.nombre,
        deuda: `$${client.deuda}`,
        estado: "Pendiente",
        riesgo: client.riesgo,
        canal: client.canal,
        ultimoContacto: "Ahora",
      },
    ])
  }

  return (
    <>

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

        <div className="flex justify-end mb-4">

          <button
            onClick={() => setOpenModal(true)}
            className="
              bg-blue-600
              hover:bg-blue-500
              text-white
              px-4 py-2
              rounded-xl
              transition
            "
          >
            Nuevo cliente
          </button>

        </div>

        <ClientsTable clients={clients} />

      </div>

      {/* MODAL */}

      <NewClientModal
        isOpen={openModal}
        onClose={() => setOpenModal(false)}
        onSave={handleSaveClient}
      />

    </>
  )
}