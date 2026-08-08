import {
  LayoutDashboard,
  Users,
  MessageSquare,
  MessageCircle,
  Phone,
} from "lucide-react"
import logo from "../assets/logo-iqor 1.png"

interface Props {
  page: string
  setPage: (page: string) => void
}

const menu = [
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
  { id: "clients", name: "Clients", icon: Users },
  { id: "calls", name: "Calls", icon: Phone },
  { id: "conversations", name: "Conversations", icon: MessageCircle },
  { id: "messages", name: "Send WhatsApp", icon: MessageSquare },
]

export default function Sidebar({ page, setPage }: Props) {
  return (
    <aside className="w-72 border-r border-zinc-800 bg-zinc-900/50">

      <div className="border-b border-zinc-800 p-6">
        <img src={logo} alt="Logo" className="mb-3 h-10 w-auto object-contain" />
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
                  ? "bg-brand text-white"
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
