import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import loginBg from "../assets/image 39.png"
import logo from "../assets/logo-iqor 1.png"

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message || "Invalid credentials")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-fixed p-4"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1f4f]/90 via-[#1a1a4f]/80 to-[#3b1f6b]/85" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-2xl sm:p-10"
      >
        <div className="mb-6 flex flex-col items-center">
          <img src={logo} alt="Logo" className="mb-4 w-[160px]" />
          <h1 className="text-xl font-semibold text-[#0b1f4f]">Sign in to continue</h1>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Username</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
              className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-gray-900 outline-none transition focus:border-[#0b1f4f]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-gray-900 outline-none transition focus:border-[#0b1f4f]"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 h-11 w-full rounded-md bg-[#0b1f4f] font-medium text-white transition hover:bg-[#16316e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  )
}
