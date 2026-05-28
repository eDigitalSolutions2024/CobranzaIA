import { useState } from "react"
import { createClient } from "../services/clients"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSave: (client: any) => void
}

export default function NewClientModal({ isOpen, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    deuda: "",
    canal: "WhatsApp",
    riesgo: "medium",
    notas: "",
  })

  if (!isOpen) return null

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit() {
    if (!form.nombre || !form.telefono) {
      alert("Nombre y teléfono son obligatorios")
      return
    }

    try {
      const payload = {
        name: form.nombre,
        phone: form.telefono,
        debt: Number(form.deuda) || 0,
        channel: form.canal,
        risk: form.riesgo,
        notes: form.notas || null,
      }

      const saved = await createClient(payload)

      onSave(saved)

      setForm({
        nombre: "",
        telefono: "",
        email: "",
        deuda: "",
        canal: "WhatsApp",
        riesgo: "medium",
        notas: "",
      })

      onClose()
    } catch (error) {
      console.log(error)
      alert("Error guardando cliente")
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6">

        <h2 className="text-2xl font-bold text-white mb-6">Nuevo Cliente</h2>

        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="text-sm text-zinc-400">Nombre completo</label>
            <input
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              placeholder="Carlos García"
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Teléfono (10 dígitos)</label>
            <input
              name="telefono"
              value={form.telefono}
              onChange={handleChange}
              placeholder="6561234567"
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Deuda ($MXN)</label>
            <input
              name="deuda"
              type="number"
              value={form.deuda}
              onChange={handleChange}
              placeholder="4500"
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Canal</label>
            <select
              name="canal"
              value={form.canal}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            >
              <option value="WhatsApp">WhatsApp</option>
              <option value="SMS">SMS</option>
              <option value="Llamada">Llamada</option>
              <option value="Email">Email</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-400">Riesgo IA</label>
            <select
              name="riesgo"
              value={form.riesgo}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            >
              <option value="low">Bajo</option>
              <option value="medium">Medio</option>
              <option value="high">Alto</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="text-sm text-zinc-400">Notas</label>
            <textarea
              name="notas"
              value={form.notas}
              onChange={handleChange}
              rows={3}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500"
          >
            Guardar cliente
          </button>
        </div>

      </div>
    </div>
  )
}
