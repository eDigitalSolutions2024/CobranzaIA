import { useEffect, useState } from "react"
import { getClients } from "../services/clients"
import { sendWhatsapp } from "../services/messages"

const templates = [
  {
    id: 1,
    label: "Debt reminder",
    value: "cobranza_recordatorio",
    preview: `Hola {{cliente}},\n\nDetectamos un saldo pendiente de \${{deuda}} MXN.\n\n¿Deseas regularizar tu cuenta?`,
  },
  {
    id: 2,
    label: "Payment promise",
    value: "promesa_pago",
    preview: `Hola {{cliente}},\n\nEntendemos tu situación. ¿Podemos acordar una fecha de pago para tu deuda de \${{deuda}} MXN?`,
  },
  {
    id: 3,
    label: "Final notice",
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
      alert("Select a client")
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
      await sendWhatsapp(body)
      alert(`Message sent to ${client.name} (${client.phone})`)
    } catch (error: any) {
      console.log(error)
      alert(`Error sending message: ${error.message || "Error connecting to the server"}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div>

      <h1 className="text-4xl font-bold mb-2">Send WhatsApp</h1>
      <p className="text-zinc-400 mb-8">Send official Meta templates to your clients</p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* CLIENT */}
        <div>
          <label className="text-sm text-zinc-400 block mb-2">
            1. Select client
          </label>
          <select
            className="w-full rounded-xl bg-[var(--bg-main)] border border-[var(--border)] p-3 text-white"
            onChange={(e) =>
              setClient(clients.find((c) => c._id === e.target.value) || null)
            }
          >
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} — ${Number(c.debt).toLocaleString("en-US")}
              </option>
            ))}
          </select>

          {client && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-3 text-sm">
              <p className="text-zinc-300">📱 {client.phone}</p>
              <p className="text-zinc-400 mt-1">
                Debt: ${Number(client.debt).toLocaleString("en-US")} MXN
              </p>
              <p className="text-zinc-400">Status: {client.status}</p>
            </div>
          )}
        </div>

        {/* TEMPLATE */}
        <div>
          <label className="text-sm text-zinc-400 block mb-2">
            2. Choose template
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
                    : "border-[var(--border)] bg-[var(--bg-main)] text-zinc-300 hover:border-[var(--border-soft)]"
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
            3. Preview
          </label>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-5 min-h-[200px] whitespace-pre-line text-sm text-zinc-200">
            {preview}
          </div>
        </div>

      </div>

      <button
        onClick={send}
        disabled={sending || !client}
        className="mt-8 rounded-xl bg-brand px-8 py-3 font-semibold hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? "Sending..." : "SEND MESSAGE"}
      </button>

    </div>
  )
}
