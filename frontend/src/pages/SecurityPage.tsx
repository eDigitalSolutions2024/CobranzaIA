import { useEffect, useState } from "react"
import { getAuditLog, logoutAll } from "../services/auth"
import { useAuth } from "../context/AuthContext"

const EVENT_LABEL: Record<string, string> = {
  login_success: "Login exitoso",
  login_failed: "Login fallido",
  logout_all: "Cerró todas las sesiones",
}

const EVENT_COLOR: Record<string, string> = {
  login_success: "bg-green-500/10 text-green-400",
  login_failed: "bg-red-500/10 text-red-400",
  logout_all: "bg-yellow-500/10 text-yellow-400",
}

const REASON_LABEL: Record<string, string> = {
  invalid_password: "Contraseña incorrecta",
  user_not_found: "Usuario no encontrado",
}

export default function SecurityPage() {
  const { logout } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const data = await getAuditLog(100)
      setLogs(data)
    } catch (error) {
      console.log(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogoutAll() {
    setSigningOut(true)
    try {
      await logoutAll()
      // El token de ESTA misma sesión también quedó invalidado — hay que
      // cerrar sesión localmente ya, en vez de esperar a que la próxima
      // petición falle con un 401 inesperado.
      logout()
    } catch (error) {
      console.log(error)
      setSigningOut(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Security</h1>
        <p className="mt-2 text-zinc-400">Sessions and access audit log</p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Active sessions</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Sign out of every device where you're currently logged in — including this one.
            </p>
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={signingOut}
            className="rounded-xl bg-red-600/20 px-5 py-3 font-medium text-red-400 hover:bg-red-600/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingOut ? "Signing out..." : "Sign out everywhere"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Access log</h2>
          <p className="text-sm text-zinc-400">Last {logs.length} events</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="pb-3 text-sm text-zinc-500">Event</th>
                <th className="pb-3 text-sm text-zinc-500">Email</th>
                <th className="pb-3 text-sm text-zinc-500">IP</th>
                <th className="pb-3 text-sm text-zinc-500">Reason</th>
                <th className="pb-3 text-sm text-zinc-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">Loading...</td>
                </tr>
              )}

              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">No access events yet</td>
                </tr>
              )}

              {logs.map((log) => (
                <tr key={log._id} className="border-b border-zinc-800/50">
                  <td className="py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${EVENT_COLOR[log.event] || "bg-zinc-500/10 text-zinc-400"}`}>
                      {EVENT_LABEL[log.event] || log.event}
                    </span>
                  </td>
                  <td className="py-3 text-zinc-300">{log.email}</td>
                  <td className="py-3 text-zinc-500">{log.ip}</td>
                  <td className="py-3 text-zinc-500">{REASON_LABEL[log.reason] || log.reason || "—"}</td>
                  <td className="py-3 text-zinc-500">{new Date(log.createdAt).toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-main)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-white mb-2">Sign out everywhere?</h2>
            <p className="text-sm text-zinc-400 mb-6">
              This will immediately end every active session, including this one — you'll need to sign in again right after.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmOpen(false); handleLogoutAll() }}
                className="px-5 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40"
              >
                Sign out everywhere
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
