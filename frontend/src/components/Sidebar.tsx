import {
  LayoutDashboard,
  Users,
  Workflow,
  MessageSquare,
  BarChart3,
} from "lucide-react"

const menu = [
  {
    name: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Clientes",
    icon: Users,
  },
  {
    name: "Workflows",
    icon: Workflow,
  },
  {
    name: "Mensajes",
    icon: MessageSquare,
  },
  {
    name: "Analytics",
    icon: BarChart3,
  },
]

export default function Sidebar() {
  return (
    <aside className="w-72 border-r border-zinc-800 bg-zinc-900/50">
      
      <div className="border-b border-zinc-800 p-6">
        <h1 className="text-2xl font-bold">
          CobranzaAI
        </h1>

        <p className="mt-1 text-sm text-zinc-400">
          Smart Collection Platform
        </p>
      </div>

      <nav className="p-4">
        {menu.map((item) => (
          <button
            key={item.name}
            className="
              mb-2 flex w-full items-center gap-3
              rounded-xl px-4 py-3
              text-zinc-300
              transition-all
              hover:bg-zinc-800
              hover:text-white
            "
          >
            <item.icon size={20} />

            <span className="font-medium">
              {item.name}
            </span>
          </button>
        ))}
      </nav>

    </aside>
  )
}