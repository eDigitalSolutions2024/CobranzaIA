import { useEffect, useState } from "react"
import { getMessages } from "../services/messages"

const DIRECTION_ICON: Record<string, string> = {
  outbound: "→",
  inbound: "←",
}

const STATUS_COLOR: Record<string, string> = {
  sent: "text-blue-400",
  delivered: "text-blue-300",
  read: "text-green-400",
  replied: "text-green-300",
  failed: "text-red-400",
  prepared: "text-zinc-400",
}

export default function RecentActivity() {
  const [activities, setActivities] = useState<any[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const data = await getMessages(10)
      setActivities(data)
    } catch (error) {
      console.log(error)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">

      <div className="mb-6">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <p className="text-sm text-white">Latest messages</p>
      </div>

      <div className="space-y-3">
        {activities.length === 0 && (
          <div className="text-zinc-500 text-sm">No activity</div>
        )}

        {activities.map((activity) => (
          <div
            key={activity._id}
            className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-zinc-200">
                <span className="text-zinc-500 mr-1">
                  {DIRECTION_ICON[activity.direction] || "·"}
                </span>
                {activity.clientId?.name || activity.phone}
              </p>
              <span
                className={`text-xs font-medium ${
                  STATUS_COLOR[activity.status] || "text-zinc-400"
                }`}
              >
                {activity.status}
              </span>
            </div>

            <p className="text-sm text-zinc-400 truncate">{activity.message}</p>

            <span className="text-xs text-zinc-600 mt-1 block">
              {new Date(activity.createdAt).toLocaleString("en-US")}
            </span>
          </div>
        ))}
      </div>

    </div>
  )
}
