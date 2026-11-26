import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { ArrowRight } from "lucide-react"

// Llamadas con resultado de pago por semana: las mismas que cuenta la tarjeta Payment promises (las calcula el
// servidor sobre todos los clientes)
export type PromiseWeek = { weekStart: string; count: number }

export default function RecoveryChart({ weeks, onViewCalls }: { weeks: PromiseWeek[]; onViewCalls: () => void }) {
  const data = weeks.map((w) => ({
    day: new Date(w.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    total: w.count,
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null

    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 shadow-xl">
        <p className="text-sm text-[var(--text-secondary)]">{label}</p>
        <p className="text-lg font-bold text-white">
          {Number(payload[0].value).toLocaleString("en-US")} payment {Number(payload[0].value) === 1 ? "call" : "calls"}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Weekly payment promises</h2>
        <p className="text-sm text-[var(--text-secondary)]">Calls with a payment result per week (Mon–Sun), last 8 weeks</p>
      </div>

      <div className="min-h-[250px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 15, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--danger)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="var(--border)" strokeOpacity={0.35} vertical={true} strokeDasharray="3 3" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} width={55} tick={{ fill: "var(--text-muted)", fontSize: 12 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }} />
            <Area type="monotone" dataKey="total" stroke="var(--danger)" strokeWidth={3} fill="url(#recoveryGradient)" dot={{ r: 5, fill: "var(--danger)", stroke: "var(--danger)", strokeWidth: 2 }} activeDot={{ r: 7, fill: "var(--danger)", stroke: "var(--danger)", strokeWidth: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <button onClick={onViewCalls} className="cursor-pointer mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] py-3 text-sm font-medium text-[var(--brand-blue-light)] transition-colors hover:bg-[var(--bg-card-hover)]">
        View payment calls
        <ArrowRight size={16} />
      </button>
    </div>
  )
}