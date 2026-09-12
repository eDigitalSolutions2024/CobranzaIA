import { useState } from "react"
import Sidebar from "../components/Sidebar"
import Topbar from "../components/Topbar"

type Props = {
  children: React.ReactNode
  page: string
  setPage: (page: string) => void
}

export default function MainLayout({
  children,
  page,
  setPage,
}: Props) {
  // Vive aquí (no en Sidebar) para que sobreviva a los re-renders al cambiar
  // de página — MainLayout nunca se desmonta mientras la sesión sigue activa.
  const [collapsed, setCollapsed] = useState(false)

  return (
    // h-screen + overflow-hidden (en vez de min-h-screen): así el sidebar
    // ocupa el alto completo del viewport como hijo flex normal y solo el
    // <main> hace scroll — con min-h-screen el aside se quedaba con altura
    // "auto" (la de su propio contenido) y el "sticky" no tenía dentro de qué
    // pegarse, así que se iba con el resto de la página al hacer scroll.
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">

      <Sidebar
        page={page}
        setPage={setPage}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />

      <div className="flex min-w-0 flex-1 flex-col">

        <Topbar />

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {children}
        </main>

      </div>

    </div>
  )
}