import { useEffect, useState } from "react"
import { getClients } from "../services/clients"
import { API_URL } from "../services/api"

const templates = [
  {
    id: 1,
    label: "Recordatorio de deuda",
    value: "cobranza_recordatorio",
    preview: `Hola {{cliente}},\n\nDetectamos un saldo pendiente de \${{deuda}} MXN.\n\n¿Deseas regularizar tu cuenta?`,
  },
  {
    id: 2,
    label: "Promesa de pago",
    value: "promesa_pago",
    preview: `Hola {{cliente}},\n\nEntendemos tu situación. ¿Podemos acordar una fecha de pago para tu deuda de \${{deuda}} MXN?`,
  },
  {
    id: 3,
    label: "Último aviso",
    value: "ultimo_aviso",
    preview: `Hola {{cliente}},\n\nEste es tu último aviso. Tienes un saldo pendiente de \${{deuda}} MXN.\n\nContáctanos hoy para evitar acciones legales.`,
  },
]

export default function MessagesPage() {
  const [clients, setClients] = useState<any[]>([])
  const [client, setClient] = useState<any>(null)
  const [template, setTemplate] = useState(templates[0])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    try {
      const data = await getClients()
      setClients(data)
    } catch (error) {
      console.log(error)
    }
  }

  const preview = client
    ? template.preview
        .replace("{{cliente}}", client.name)
        .replace("{{deuda}}", Number(client.debt).toLocaleString("es-MX"))
    : template.preview

  async function send() {
    if (!client) {
      alert("Selecciona un cliente")
      return
    }

    setSending(true)

    const body = {
      clientId: client._id,
      clientName: client.name,
      phone: client.phone,
      debt: client.debt,
      channel: client.channel,
      template: template.value,
    }

    try {
      const response = await fetch(`${API_URL}/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (data.success) {
        alert(`Mensaje enviado a ${client.name} (${client.phone})`)
      } else {
        console.log("Error Meta:", data.error)
        alert(`Error al enviar: ${data.message}`)
      }
    } catch (error) {
      console.log(error)
      alert("Error de conexión con el servidor")
    } finally {
      setSending(false)
    }
  }

  return (
    <div>

      <h1 className="text-4xl font-bold mb-2">Enviar WhatsApp</h1>
      <p className="text-zinc-400 mb-8">Envía templates oficiales de Meta a tus clientes</p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* CLIENTE */}
        <div>
          <label className="text-sm text-zinc-400 block mb-2">
            1. Selecciona cliente
          </label>
          <select
            className="w-full rounded-xl bg-zinc-900 border border-zinc-700 p-3 text-white"
            onChange={(e) =>
              setClient(clients.find((c) => c._id === e.target.value) || null)
            }
          >
            <option value="">— Seleccionar cliente —</option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} — ${Number(c.debt).toLocaleString("es-MX")}
              </option>
            ))}
          </select>

          {client && (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
              <p className="text-zinc-300">📱 {client.phone}</p>
              <p className="text-zinc-400 mt-1">
                Deuda: ${Number(client.debt).toLocaleString("es-MX")} MXN
              </p>
              <p className="text-zinc-400">Estado: {client.status}</p>
            </div>
          )}
        </div>

        {/* TEMPLATE */}
        <div>
          <label className="text-sm text-zinc-400 block mb-2">
            2. Elige template
          </label>
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t)}
                className={`
                  w-full text-left rounded-xl border p-3 transition-colors
                  ${template.id === t.id
                    ? "border-blue-500 bg-blue-500/10 text-white"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
                  }
                `}
              >
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{t.value}</p>
              </button>
            ))}
          </div>
        </div>

        {/* PREVIEW */}
        <div>
          <label className="text-sm text-zinc-400 block mb-2">
            3. Vista previa
          </label>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 min-h-[200px] whitespace-pre-line text-sm text-zinc-200">
            {preview}
          </div>
        </div>

      </div>

      <button
        onClick={send}
        disabled={sending || !client}
        className="mt-8 rounded-xl bg-blue-600 px-8 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? "Enviando..." : "ENVIAR MENSAJE"}
      </button>

    </div>
  )
}
