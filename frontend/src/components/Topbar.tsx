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
import headerBackgroundImage from "../assets/HeadBar_C.svg";

export default function Topbar() {

  const { user, logout } = useAuth()
  const [openMenu, setOpenMenu] = useState(false)

  return (
    <header
      className="flex h-[100px] w-full shrink-0 items-center justify-between border-b border-zinc-900 
      bg-[length:1600px_100px] bg-center bg-no-repeat px-6 py-4"
      style={{ backgroundImage: `url(${headerBackgroundImage})` }}
    >

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
            text-white
            outline-none
            placeholder:text-white
          "
        />

      </div>

      {/* RIGHT */}

      <div className="flex items-center gap-4">

        {/* NOTIFICATIONS */}

        <button className="
          rounded-xl
       
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
              bg-[var(--bg-main)]
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
