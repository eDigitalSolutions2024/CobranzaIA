import {
  LayoutDashboard,
  Users,
  MessageSquare,
  MessageCircle,
  Phone,
  Gauge,
} from "lucide-react"
import logo from "../assets/iqor-logo.svg"

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
  { id: "usage", name: "Resources", icon: Gauge },
]

export default function Sidebar({ page, setPage }: Props) {
  return (
    <aside className="w-72 border-r border-[var(--border)] bg-[var(--bg-main)]">

      <div className="border-b border-[var(--border)] p-6">
        <img src={logo} alt="Logo" className="mb-3 h-10 w-auto object-contain" />
        <h1 className="text-2xl font-bold">Cobranza<span className="text-[var(--brand-main)]">AI</span></h1>
        <p className="mt-1 text-sm text-white">Smart Collection Platform</p>
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
                  ? "bg-[var(--brand-main)] text-white"
                  : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                }
              `}
            >
              <item.icon size={25} />
              <span className="font-medium">{item.name}</span>
            </button>
          )
        })}
      </nav>

    </aside>
  )
}
