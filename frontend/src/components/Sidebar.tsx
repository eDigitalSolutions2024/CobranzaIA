import {
  LayoutDashboard,
  Users,
  MessageSquare,
  MessageCircle,
  Phone,
  Gauge,
  ShieldCheck,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import logo from "../assets/iqor-logo.svg"
import sidebarBackground from "../assets/SideBar_C.svg"

interface Props {
  page: string
  setPage: (page: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const menu = [
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
  { id: "clients", name: "Clients", icon: Users },
  { id: "calls", name: "Calls", icon: Phone },
  { id: "conversations", name: "Conversations", icon: MessageCircle },
  { id: "messages", name: "Send WhatsApp", icon: MessageSquare },
  { id: "usage", name: "Resources", icon: Gauge },
  { id: "security", name: "Security", icon: ShieldCheck },
]

export default function Sidebar({ page, setPage, collapsed, onToggleCollapse }: Props) {
  return (
    <aside
      className={`
        relative h-screen shrink-0 overflow-y-auto overflow-x-hidden border-r border-[var(--border)]
        bg-[var(--bg-main)] bg-[length:100%_auto] bg-top bg-no-repeat
        transition-[width] duration-200
        ${collapsed ? "w-20" : "w-72"}
      `}
      style={{ backgroundImage: `url(${sidebarBackground})` }}
    >

      <button
        onClick={onToggleCollapse}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="
          absolute right-3 top-6 z-10 flex h-9 w-9 items-center justify-center
          rounded-full border border-[var(--border)] bg-[var(--bg-card)]
          text-zinc-200 hover:text-white hover:bg-[var(--bg-card-hover)] transition-colors
        "
      >
        {collapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
      </button>

      <div className="border-b border-[var(--border)] p-6 overflow-hidden">
        {!collapsed && (
          <>
            <img src={logo} alt="Logo" className="mb-3 h-10 w-auto object-contain" />
            <h1 className="text-2xl font-bold whitespace-nowrap">Cobranza<span className="text-[var(--brand-main)]">AI</span></h1>
            <p className="mt-1 text-sm text-white whitespace-nowrap">Smart Collection Platform</p>
          </>
        )}
      </div>

      <nav className="p-4">
        {menu.map((item) => {
          const isActive = page === item.id
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              title={collapsed ? item.name : undefined}
              className={`
                mb-2 flex w-full items-center gap-3
                rounded-xl px-4 py-3 transition-all
                ${collapsed ? "justify-center" : ""}
                ${isActive
                  ? "bg-[var(--brand-main)] text-white"
                  : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                }
              `}
            >
              <item.icon size={25} className="shrink-0" />
              {!collapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
            </button>
          )
        })}
      </nav>

    </aside>
  )
}
