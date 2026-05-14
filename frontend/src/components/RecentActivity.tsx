const activities = [
  {
    text: "Juan Pérez realizó un pago",
    time: "Hace 2 min",
  },
  {
    text: "Promesa de pago creada",
    time: "Hace 10 min",
  },
  {
    text: "Cliente escalado a llamada",
    time: "Hace 18 min",
  },
  {
    text: "Mensaje WhatsApp enviado",
    time: "Hace 30 min",
  },
]

export default function RecentActivity() {
  return (
    <div className="
      rounded-2xl border border-zinc-800
      bg-zinc-900/50
      p-6
    ">
      
      <div className="mb-6">
        <h2 className="text-lg font-semibold">
          Actividad reciente
        </h2>

        <p className="text-sm text-zinc-400">
          Eventos en tiempo real
        </p>
      </div>

      <div className="space-y-4">
        
        {activities.map((activity) => (
          <div
            key={activity.text}
            className="
              rounded-xl border border-zinc-800
              bg-zinc-950
              p-4
            "
          >
            
            <p className="font-medium">
              {activity.text}
            </p>

            <span className="text-sm text-zinc-500">
              {activity.time}
            </span>

          </div>
        ))}

      </div>

    </div>
  )
}