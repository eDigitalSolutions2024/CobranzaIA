import { useState } from "react"
import type { CallsPreset } from "./pages/CallsPage"
import MainLayout from "./layouts/MainLayout"
import DashboardPage from "./pages/DashboardPage"
import ClientsPage from "./pages/clientsPage"
import MessagesPage from "./pages/MessagesPage"
import ConversationsPage from "./pages/ConversationsPage"
import CallsPage from "./pages/CallsPage"
import UsagePage from "./pages/UsagePage"
import SecurityPage from "./pages/SecurityPage"
import LoginPage from "./pages/LoginPage"
import { useAuth } from "./context/AuthContext"

export default function App() {
  const { user, loading } = useAuth()
  const [page, setPageState] = useState("dashboard")
  // Filtros con los que se abre Calls desde una tarjeta del Dashboard; se borran al cambiar de página
  // desde el menú para que Calls no vuelva a abrir con ellos
  const [callsPreset, setCallsPreset] = useState<CallsPreset | null>(null)

  function setPage(next: string) {
    setCallsPreset(null)
    setPageState(next)
  }

  function openCalls(preset: CallsPreset) {
    setCallsPreset(preset)
    setPageState("calls")
  }

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

      {page === "dashboard" && <DashboardPage onOpenCalls={openCalls} />}

      {page === "clients" && <ClientsPage />}

      {page === "calls" && <CallsPage preset={callsPreset} />}

      {page === "conversations" && <ConversationsPage />}

      {page === "messages" && <MessagesPage />}

      {import.meta.env.DEV && page === "usage" && <UsagePage />}

      {page === "security" && <SecurityPage />}

    </MainLayout>
  )
}
