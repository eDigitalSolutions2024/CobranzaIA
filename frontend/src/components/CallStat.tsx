type CallStatProps = {
  color: string
  label: string
  value: number
  total: number
}

export default function CallStat({
  color,
  label,
  value,
  total,
}: CallStatProps) {

  const percentage =
    total > 0
      ? Math.round((value / total) * 100)
      : 0

  return (
    <div className="flex items-center gap-3">
      <span
        className={`h-2.5 w-2.5 rounded-full ${color}`}
      />
      <h2 className="text-2xl font-bold flex-1 text-white">
        {label}
      </h2>
      <h2 className="text-3xl font-bold text-white">
        {value}
      </h2>
      <span className="w-12 text-right text-xs text-white">
        ({percentage}%)
      </span>

    </div>
  )
}