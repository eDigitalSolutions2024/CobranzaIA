import { Pie, Cell, PieChart } from "recharts"
type CallStats = {
  total?: number
  completed?: number
  withPromise?: number
  requires_human?: number
  noAnswer?: number
}

type Props = {
  callStats: CallStats
}

type CallStatProps = {
  color: string
  label: string
  value: number
  total: number
}

function CallStat({ color, label, value, total }: CallStatProps) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0

  return (
    <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <h2 className="flex-1 text-2xl text-[var(--text-secondary)]">{label}</h2>
      <h2 className="text-2xl font-semibold text-white">{value}</h2>
      <span className="w-12 text-right text-xs text-[var(--text-muted)]">({percentage}%)</span>
    </div>
  )
}

export default function VoiceCallsOverview({ callStats }: Props) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-base font-semibold text-white">Voice calls overview</h2>

      <div className="mt-6 flex items-center gap-8">

       <div className="relative h-60 w-60 shrink-0">
        <div className="flex h-60 w-60 shrink-0 items-center justify-center rounded-full border-[18px] border-green-500">

        {/*-------------PIE CHART IMPLEMENTATION 
        <PieChart width={240} height={240}>
            <Pie
                    data={[
                        { name: "Completed", value: Number(callStats.completed ?? 0) },
                        { name: "With promise", value: Number(callStats.withPromise ?? 0) },
                        { name: "Require agent", value: Number(callStats.requires_human ?? 0) },
                        { name: "No answer / Busy", value: Number(callStats.noAnswer ?? 0) },
                    ]}
                    dataKey="value"
                    cx={120}
                    cy={120}
                    innerRadius={70}
                    outerRadius={105}
                    fill="#22c55e"
                    />
        </PieChart>*/}

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold text-white">{callStats.total ?? 0}</h1>
            <h2 className="text-2xl text-white">Total calls</h2>
        </div>
    </div>
    </div>

        <div className="flex flex-1 flex-col gap-4">
          <CallStat color="bg-green-500" label="Completed" value={callStats.completed ?? 0} total={callStats.total ?? 0} />
          <CallStat color="bg-blue-500" label="With promise" value={callStats.withPromise ?? 0} total={callStats.total ?? 0} />
          <CallStat color="bg-orange-500" label="Require agent" value={callStats.requires_human ?? 0} total={callStats.total ?? 0} />
          <CallStat color="bg-slate-500" label="No answer / Busy" value={callStats.noAnswer ?? 0} total={callStats.total ?? 0} />
        </div>

      </div>

      <button className="mt-6 w-full border-t border-[var(--border)] pt-4 text-sm text-blue-400 transition-colors hover:text-blue-300">
        View calls report →
      </button>
    </div>
  )
}