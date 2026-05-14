import { useState } from "react"

import MainLayout from "./layouts/MainLayout"

import DashboardPage from "./pages/DashboardPage"
import ClientsPage from "./pages/clientsPage"

export default function App() {

  const [page, setPage] = useState("dashboard")

  return (

    <MainLayout
      page={page}
      setPage={setPage}
    >

      {page === "dashboard" && (
        <DashboardPage />
      )}

      {page === "clients" && (
        <ClientsPage />
      )}

    </MainLayout>

  )
}