import {
  Bell,
  Search,
  ChevronDown,
  User,
  Settings,
  LogOut,
} from "lucide-react"

import { useState } from "react"
import { useAuth } from "../context/AuthContext"

export default function Topbar() {

  const { user, logout } = useAuth()
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
        rounded-xl border border-[var(--border)]  bg-[var(--bg-main)]
        px-4 py-2
      ">

        <Search size={18} className="text-white " />

        <input
          placeholder="Search clients..."
          className="
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
          rounded-xl
          bg-trasnparent p-3
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
              rounded-full bg-brand font-semibold
            ">
              {(user?.name || "?").charAt(0).toUpperCase()}
            </div>

            <div>

              <p className="text-sm font-medium">
                {user?.name || "User"}
              </p>

              <p className="text-xs text-zinc-500">
                {user?.email || ""}
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
              border border-[var(--border)]
              bg-[var(--bg-main)]
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

                My profile
              </button>

              <button className="
                flex w-full items-center gap-3
                px-4 py-3
                hover:bg-zinc-800
                transition
              ">
                <Settings size={18} />

                Settings
              </button>

              <div className="border-t border-zinc-800" />

              <button
                onClick={logout}
                className="
                flex w-full items-center gap-3
                px-4 py-3
                text-red-400
                hover:bg-red-500/10
                transition
              ">
                <LogOut size={18} />

                Log out
              </button>

            </div>

          )}

        </div>

      </div>

    </header>
  )
}