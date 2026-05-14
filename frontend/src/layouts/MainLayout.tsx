import Sidebar from "../components/Sidebar"
import Topbar from "../components/Topbar"

type Props = {
  children: React.ReactNode
}

export default function MainLayout({ children }: Props) {
  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      
      <Sidebar />

      <div className="flex flex-1 flex-col">
        
        <Topbar />

        <main className="flex-1 p-6">
          {children}
        </main>

      </div>

    </div>
  )
}