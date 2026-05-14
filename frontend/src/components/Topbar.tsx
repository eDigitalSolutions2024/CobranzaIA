import { Bell, Search } from "lucide-react"

export default function Topbar() {
  return (
    <header className="
      flex items-center justify-between
      border-b border-zinc-800
      px-6 py-4
    ">
      
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

      <div className="flex items-center gap-4">
        
        <button className="
          rounded-xl border border-zinc-800
          bg-zinc-900 p-3
          hover:bg-zinc-800
        ">
          <Bell size={18} />
        </button>

        <div className="flex items-center gap-3">
          
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

        </div>

      </div>

    </header>
  )
}