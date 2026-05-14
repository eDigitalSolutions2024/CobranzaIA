import {
  Bell,
  Search,
  ChevronDown,
  User,
  Settings,
  LogOut,
} from "lucide-react"

import { useState } from "react"

export default function Topbar() {

  const [openMenu, setOpenMenu] = useState(false)

  return (
    <header className="
      flex items-center justify-between
      border-b border-zinc-800
      px-6 py-4
    ">

      {/* SEARCH */}

      <div className="
        flex items-center gap-3
        rounded-xl border border-zinc-800
        bg-zinc-900 px-4 py-2
      ">

        <Search size={18} className="text-zinc-500" />

        <input
          placeholder="Buscar clientes..."
          className="
            bg-transparent
            text-sm
            outline-none
            placeholder:text-zinc-500
          "
        />

      </div>

      {/* RIGHT */}

      <div className="flex items-center gap-4">

        {/* NOTIFICATIONS */}

        <button className="
          rounded-xl border border-zinc-800
          bg-zinc-900 p-3
          hover:bg-zinc-800
          transition
        ">
          <Bell size={18} />
        </button>

        {/* USER MENU */}

        <div className="relative">

          <button
            onClick={() => setOpenMenu(!openMenu)}
            className="
              flex items-center gap-3
              rounded-xl
              px-2 py-1
              hover:bg-zinc-900
              transition
            "
          >

            <div className="
              flex h-10 w-10 items-center justify-center
              rounded-full bg-blue-500 font-semibold
            ">
              A
            </div>

            <div>

              <p className="text-sm font-medium">
                Admin
              </p>

              <p className="text-xs text-zinc-500">
                Super Admin
              </p>

            </div>

            <ChevronDown
              size={16}
              className={`
                transition-transform
                ${openMenu ? "rotate-180" : ""}
              `}
            />

          </button>

          {/* DROPDOWN */}

          {openMenu && (

            <div className="
              absolute right-0 top-16
              w-60
              overflow-hidden
              rounded-2xl
              border border-zinc-800
              bg-zinc-900
              shadow-2xl
              z-50
            ">

              <button className="
                flex w-full items-center gap-3
                px-4 py-3
                hover:bg-zinc-800
                transition
              ">
                <User size={18} />

                Mi perfil
              </button>

              <button className="
                flex w-full items-center gap-3
                px-4 py-3
                hover:bg-zinc-800
                transition
              ">
                <Settings size={18} />

                Configuración
              </button>

              <div className="border-t border-zinc-800" />

              <button className="
                flex w-full items-center gap-3
                px-4 py-3
                text-red-400
                hover:bg-red-500/10
                transition
              ">
                <LogOut size={18} />

                Cerrar sesión
              </button>

            </div>

          )}

        </div>

      </div>

    </header>
  )
}