import { useState } from "react"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSave: (client: any) => void
}

export default function NewClientModal({
  isOpen,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    deuda: "",
    canal: "WhatsApp",
    riesgo: "Medio",
    notas: "",
  })

  if (!isOpen) return null

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = () => {
    onSave({
      ...form,
      ultimoContacto: "Ahora",
      estado: "Pendiente",
    })

    setForm({
      nombre: "",
      telefono: "",
      email: "",
      deuda: "",
      canal: "WhatsApp",
      riesgo: "Medio",
      notas: "",
    })

    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6">
        
        <h2 className="text-2xl font-bold text-white mb-6">
          Nuevo Cliente
        </h2>

        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="text-sm text-zinc-400">
              Nombre completo
            </label>

            <input
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">
              Teléfono
            </label>

            <input
              name="telefono"
              value={form.telefono}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">
              Email
            </label>

            <input
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">
              Deuda
            </label>

            <input
              name="deuda"
              value={form.deuda}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">
              Canal
            </label>

            <select
              name="canal"
              value={form.canal}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            >
              <option>WhatsApp</option>
              <option>SMS</option>
              <option>Llamada</option>
              <option>Email</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-400">
              Riesgo IA
            </label>

            <select
              name="riesgo"
              value={form.riesgo}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            >
              <option>Bajo</option>
              <option>Medio</option>
              <option>Alto</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="text-sm text-zinc-400">
              Notas
            </label>

            <textarea
              name="notas"
              value={form.notas}
              onChange={handleChange}
              rows={4}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

        </div>

        <div className="flex justify-end gap-3 mt-6">

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white"
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
          >
            Guardar cliente
          </button>

        </div>

      </div>
    </div>
  )
}