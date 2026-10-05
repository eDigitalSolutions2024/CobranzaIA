import { useEffect, useState } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts"
import { getUsage, getAnthropicUsage } from "../services/usage"

const RANGES = [
  { label: "Today", value: "today" as const },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "All", value: "all" as const },
]

// Proveedores del panel — mismo orden en las tarjetas y en la gráfica diaria apilada.
// Deepgram y ElevenLabs solo se consumen en llamadas con el motor ElevenLabs.
// consoleUrl: página del proveedor donde se ve el gasto REAL (el de esta pantalla es estimado).
// Los enlaces pueden cambiar si el proveedor reorganiza su consola; entonces entrar por su menú.
const PROVIDERS = [
  {
    key: "openai", label: "OpenAI (voice)", color: "#3b82f6", dailyKey: "openaiCostUsd",
    consoleUrl: "https://platform.openai.com/usage",
    cost: (d: any) => d?.calls?.openai?.costUsd ?? 0,
    detail: (d: any) => `${Number(d.calls.openai.totalTokens ?? 0).toLocaleString("en-US")} tokens`,
  },
  {
    key: "claude", label: "Claude", color: "#f59e0b", dailyKey: "claudeCostUsd",
    consoleUrl: "https://console.anthropic.com/settings/cost",
    cost: (d: any) => d?.calls?.claude?.costUsd ?? 0,
    detail: (d: any) =>
      `${Number((d.calls.claude.inputTokens ?? 0) + (d.calls.claude.outputTokens ?? 0)).toLocaleString("en-US")} tokens`,
  },
  {
    key: "deepgram", label: "Deepgram (STT)", color: "#14b8a6", dailyKey: "deepgramCostUsd",
    consoleUrl: "https://console.deepgram.com/",
    cost: (d: any) => d?.calls?.deepgram?.costUsd ?? 0,
    detail: (d: any) => `${d.calls.deepgram?.minutes ?? 0} min`,
  },
  {
    key: "elevenlabs", label: "ElevenLabs (voice)", color: "#a855f7", dailyKey: "elevenlabsCostUsd",
    consoleUrl: "https://elevenlabs.io/app/subscription",
    cost: (d: any) => d?.calls?.elevenlabs?.costUsd ?? 0,
    detail: (d: any) => `${Number(d.calls.elevenlabs?.characters ?? 0).toLocaleString("en-US")} chars`,
  },
  {
    key: "twilio", label: "Twilio (calls)", color: "#ef4444", dailyKey: "twilioCostUsd",
    consoleUrl: "https://console.twilio.com/us1/billing/manage-billing/billing-overview",
    cost: (d: any) => d?.calls?.twilioCostUsd ?? 0,
    detail: (d: any) => minutes(d.calls.totalDurationSeconds ?? 0),
  },
  {
    key: "whatsapp", label: "WhatsApp", color: "#22c55e", dailyKey: "whatsappCostUsd",
    consoleUrl: "https://business.facebook.com/billing_hub/",
    cost: (d: any) => d?.whatsapp?.costUsd ?? 0,
    detail: (d: any) => `${d.whatsapp.outboundCount ?? 0} sent`,
  },
]

function minutes(seconds: number): string {
  return `${Math.round(Number(seconds || 0) / 60).toLocaleString("en-US")} min`
}

function usd(n: number): string {
  return `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

export default function UsagePage() {
  const [range, setRange] = useState<number | "all" | "today">(30)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  // Gasto real de Anthropic (consola). Se carga aparte: si falla no debe tumbar el resto del panel.
  const [anthropic, setAnthropic] = useState<any>(null)

  async function load() {
    try {
      setLoading(true)
      const [usage, real] = await Promise.all([
        getUsage(range),
        getAnthropicUsage(range).catch((error) => ({ configured: true, error: String(error?.message ?? error) })),
      ])
      setData(usage)
      setAnthropic(real)
    } catch (error) {
      console.log(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [range])

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold">Resources</h1>
          <p className="mt-2 text-zinc-400">System usage and estimated cost by provider — development only.</p>
          <p className="mt-1 text-xs text-zinc-500">Data comes from the backend this app is connected to ({import.meta.env.VITE_API_URL || "http://localhost:3003/api"}).</p>
        </div>

        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={String(r.value)}
              onClick={() => setRange(r.value)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                range === r.value
                  ? "bg-brand text-white"
                  : "border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Totales */}
      <div className="mt-8 grid gap-6 md:grid-cols-4">
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-6">
          <p className="text-sm text-white">Total calls</p>
          <h2 className="mt-4 text-3xl font-bold text-white">
            {loading ? "..." : data?.calls?.total ?? 0}
          </h2>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
          <p className="text-sm text-white">Call minutes</p>
          <h2 className="mt-4 text-3xl font-bold text-white">
            {loading ? "..." : minutes(data?.calls?.totalDurationSeconds ?? 0)}
          </h2>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
          <p className="text-sm text-white">WhatsApp messages sent</p>
          <h2 className="mt-4 text-3xl font-bold text-white">
            {loading ? "..." : data?.whatsapp?.outboundCount ?? 0}
          </h2>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <p className="text-sm text-white">Total estimated cost</p>
          <h2 className="mt-4 text-3xl font-bold text-emerald-400">
            {loading ? "..." : usd(data?.totalCostUsd ?? 0)}
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            {loading || !data?.calls?.total ? "" : `${usd((data.totalCostUsd ?? 0) / data.calls.total)} per call`}
          </p>
        </div>
      </div>

      {/* Costo por proveedor */}
      <div className="mt-8">
        <h2 className="text-sm font-medium text-white mb-3 uppercase tracking-wider">Cost by provider (estimated)</h2>
        <p className="text-xs text-zinc-400 mb-3">
          Calls by voice engine: OpenAI {loading ? "..." : data?.calls?.byEngine?.openai ?? 0} · ElevenLabs{" "}
          {loading ? "..." : data?.calls?.byEngine?.elevenlabs ?? 0}
        </p>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {PROVIDERS.map((provider) => (
            <div key={provider.key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4 text-center">
              <p className="text-sm text-white">{provider.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: provider.color }}>
                {loading ? "..." : usd(provider.cost(data))}
              </p>
              <p className="text-xs text-zinc-400 mt-1">{loading || !data ? "" : provider.detail(data)}</p>
              <a
                href={provider.consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
              >
                Real cost ↗
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Gasto REAL de Claude según la consola de Anthropic, comparado con el estimado */}
      <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <h2 className="text-sm font-medium text-white uppercase tracking-wider">Claude — real spend (Anthropic console)</h2>
        <p className="mt-2 text-xs text-zinc-400">
          Open in the console:{" "}
          <a href="https://console.anthropic.com/settings/cost" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Cost ↗</a>
          {" · "}
          <a href="https://console.anthropic.com/settings/usage" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Usage ↗</a>
          {" · "}
          <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Billing / add credits ↗</a>
          {" · "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">API keys ↗</a>
        </p>

        {!anthropic && <p className="mt-3 text-sm text-zinc-400">Loading...</p>}

        {anthropic && anthropic.configured === false && (
          <p className="mt-3 text-sm text-zinc-300">
            Not connected. Create an <b>Admin key</b> in the Anthropic console (Organization settings → Admin keys) and add it
            to the backend <code className="rounded bg-zinc-800 px-1">.env</code> as <code className="rounded bg-zinc-800 px-1">ANTHROPIC_ADMIN_KEY</code>,
            then restart the backend. Never put it in the frontend.
          </p>
        )}

        {anthropic?.error && (
          <p className="mt-3 text-sm text-red-400">Could not read the Anthropic billing API: {anthropic.error}</p>
        )}

        {anthropic?.configured && !anthropic.error && (() => {
          const real = Number(anthropic.totalCostUsd ?? 0)
          const estimated = Number(data?.calls?.claude?.costUsd ?? 0)
          const diff = real - estimated
          return (
            <>
              <div className="mt-4 grid gap-4 grid-cols-2 md:grid-cols-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4 text-center">
                  <p className="text-sm text-white">Real cost</p>
                  <p className="text-2xl font-bold mt-1 text-amber-400">{usd(real)}</p>
                  <p className="text-xs text-zinc-400 mt-1">per Anthropic, UTC days</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4 text-center">
                  <p className="text-sm text-white">Estimated by this app</p>
                  <p className="text-2xl font-bold mt-1 text-white">{usd(estimated)}</p>
                  <p className="text-xs text-zinc-400 mt-1">from tokens saved per call</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4 text-center">
                  <p className="text-sm text-white">Not tracked per call</p>
                  <p className={`text-2xl font-bold mt-1 ${diff > Math.max(0.05, real * 0.1) ? "text-red-400" : "text-green-400"}`}>{usd(diff)}</p>
                  <p className="text-xs text-zinc-400 mt-1">tests, post-call analysis, WhatsApp…</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4 text-center">
                  <p className="text-sm text-white">Tokens</p>
                  <p className="text-sm font-semibold mt-1 text-white">
                    {Number(anthropic.totals?.inputTokens ?? 0).toLocaleString("en-US")} in ·{" "}
                    {Number(anthropic.totals?.outputTokens ?? 0).toLocaleString("en-US")} out
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {Number(anthropic.totals?.cacheReadTokens ?? 0).toLocaleString("en-US")} read from cache
                  </p>
                </div>
              </div>

              <div className="mt-6 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={anthropic.days ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                    <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => usd(v)} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                      formatter={(value: any) => [usd(Number(value)), "Real cost"]}
                    />
                    <Bar dataKey="costUsd" name="Real cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )
        })()}
      </div>

      {/* Estado de llamadas */}
      <div className="mt-8 grid gap-4 grid-cols-2 md:grid-cols-4">
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
          <p className="text-sm text-white">Completed</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{loading ? "..." : data?.calls?.completed ?? 0}</p>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-center">
          <p className="text-sm text-white">Requires agent</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">{loading ? "..." : data?.calls?.requiresHuman ?? 0}</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
          <p className="text-sm text-white">Failed</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{loading ? "..." : data?.calls?.failed ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4 text-center">
          <p className="text-sm text-white">In progress</p>
          <p className="text-2xl font-bold text-white mt-1">{loading ? "..." : data?.calls?.inProgress ?? 0}</p>
        </div>
      </div>

      {/* Tendencia diaria de llamadas */}
      <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Calls per day</h2>
          <p className="text-sm text-zinc-400">Daily call volume</p>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.timeseries ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                formatter={(value: any) => [value, "Calls"]}
              />
              <Bar dataKey="calls" name="Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tendencia diaria de costo */}
      <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Estimated cost per day</h2>
          <p className="text-sm text-zinc-400">Stacked by provider</p>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.timeseries ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => usd(v)} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                formatter={(value: any, name: any) => [usd(Number(value)), name]}
              />
              <Legend />
              {PROVIDERS.map((provider) => (
                <Bar key={provider.key} dataKey={provider.dailyKey} name={provider.label} stackId="cost" fill={provider.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}
