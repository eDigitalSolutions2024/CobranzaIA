import {
  LayoutDashboard,
  Users,
  MessageSquare,
  MessageCircle,
  BarChart3,
} from "lucide-react"

interface Props {
  page: string
  setPage: (page: string) => void
}

const menu = [
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
  { id: "clients", name: "Clientes", icon: Users },
  { id: "conversations", name: "Conversaciones", icon: MessageCircle },
  { id: "messages", name: "Enviar WhatsApp", icon: MessageSquare },
  { id: "analytics", name: "Analytics", icon: BarChart3 },
]

export default function Sidebar({ page, setPage }: Props) {
  return (
    <aside className="w-72 border-r border-zinc-800 bg-zinc-900/50">

      <div className="border-b border-zinc-800 p-6">
        <h1 className="text-2xl font-bold">CobranzaAI</h1>
        <p className="mt-1 text-sm text-zinc-400">Smart Collection Platform</p>
      </div>

      <nav className="p-4">
        {menu.map((item) => {
          const isActive = page === item.id
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`
                mb-2 flex w-full items-center gap-3
                rounded-xl px-4 py-3 transition-all
                ${isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }
              `}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.name}</span>
            </button>
          )
        })}
      </nav>

    </aside>
  )
}
