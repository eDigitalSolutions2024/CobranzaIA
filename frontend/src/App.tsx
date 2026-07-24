import { useState } from "react"
import MainLayout from "./layouts/MainLayout"
import DashboardPage from "./pages/DashboardPage"
import ClientsPage from "./pages/clientsPage"
import MessagesPage from "./pages/MessagesPage"
import ConversationsPage from "./pages/ConversationsPage"
import CallsPage from "./pages/CallsPage"
import LoginPage from "./pages/LoginPage"
import { useAuth } from "./context/AuthContext"

export default function App() {
  const { user, loading } = useAuth()
  const [page, setPage] = useState("dashboard")

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading...
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <MainLayout page={page} setPage={setPage}>

      {page === "dashboard" && <DashboardPage />}

      {page === "clients" && <ClientsPage />}

      {page === "calls" && <CallsPage />}

      {page === "conversations" && <ConversationsPage />}

      {page === "messages" && <MessagesPage />}

      {page === "analytics" && (
        <div className="flex items-center justify-center h-64 text-zinc-500">
          Analytics — coming soon
        </div>
      )}

    </MainLayout>
  )
}
