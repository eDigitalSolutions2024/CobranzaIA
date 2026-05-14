import {
  LineChart,
  Line,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const data = [
  { day: "Lun", amount: 4000 },
  { day: "Mar", amount: 3000 },
  { day: "Mié", amount: 5000 },
  { day: "Jue", amount: 7000 },
  { day: "Vie", amount: 6000 },
  { day: "Sáb", amount: 9000 },
]

export default function RecoveryChart() {
  return (
    <div className="
      rounded-2xl border border-zinc-800
      bg-zinc-900/50
      p-6
    ">
      
      <div className="mb-6">
        <h2 className="text-lg font-semibold">
          Recuperación semanal
        </h2>

        <p className="text-sm text-zinc-400">
          Cobranza recuperada en los últimos días
        </p>
      </div>

      <div className="h-80">
        
        <ResponsiveContainer width="100%" height="100%">
          
          <LineChart data={data}>
            
            <XAxis
              dataKey="day"
              stroke="#71717a"
            />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="amount"
              stroke="#3b82f6"
              strokeWidth={3}
            />

          </LineChart>

        </ResponsiveContainer>

      </div>

    </div>
  )
}