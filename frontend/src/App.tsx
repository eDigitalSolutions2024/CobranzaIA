import { useState } from "react"
import MainLayout from "./layouts/MainLayout"
import DashboardPage from "./pages/DashboardPage"
import ClientsPage from "./pages/clientsPage"
import MessagesPage from "./pages/MessagesPage"
import ConversationsPage from "./pages/ConversationsPage"
import CallsPage from "./pages/CallsPage"

export default function App() {
  const [page, setPage] = useState("dashboard")

  return (
    <MainLayout page={page} setPage={setPage}>

      {page === "dashboard" && <DashboardPage />}

      {page === "clients" && <ClientsPage />}

      {page === "calls" && <CallsPage />}

      {page === "conversations" && <ConversationsPage />}

      {page === "messages" && <MessagesPage />}

      {page === "analytics" && (
        <div className="flex items-center justify-center h-64 text-zinc-500">
          Analytics — próximamente
        </div>
      )}

    </MainLayout>
  )
}
