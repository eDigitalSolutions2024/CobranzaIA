import { useState } from "react"
import { createClient } from "../services/clients"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSave: (client: any) => void
}

const initialForm = {
  nombre: "",
  telefono: "",
  email: "",
  deuda: "",
  canal: "WhatsApp",
  riesgo: "medium",
  notas: "",
  country: "Mexico",
  customerId: "",
  collectorId: "",
  team: "",
  teamLeader: "",
  collector: "",
  invoiceNumber: "",
  createDate: "",
  dueDate: "",
  agingDays: "",
  loanLease: "",
  usdAmount: "",
  contact: "",
  nextAction: "",
  paymentPromiseAmount: "",
  datePromise: "",
}

export default function NewClientModal({ isOpen, onClose, onSave }: Props) {
  const [form, setForm] = useState(initialForm)

  if (!isOpen) return null

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit() {
    if (!form.nombre || !form.telefono) {
      alert("Name and phone are required")
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
        country: form.country || "Mexico",
        customerId: form.customerId ? Number(form.customerId) : null,
        collectorId: form.collectorId ? Number(form.collectorId) : null,
        team: form.team || null,
        teamLeader: form.teamLeader || null,
        collector: form.collector || null,
        invoiceNumber: form.invoiceNumber || null,
        createDate: form.createDate || null,
        dueDate: form.dueDate || null,
        agingDays: form.agingDays ? Number(form.agingDays) : null,
        loanLease: form.loanLease || null,
        usdAmount: form.usdAmount ? Number(form.usdAmount) : null,
        contact: form.contact || null,
        nextAction: form.nextAction || null,
        paymentPromiseAmount: form.paymentPromiseAmount ? Number(form.paymentPromiseAmount) : null,
        datePromise: form.datePromise || null,
      }

      const saved = await createClient(payload)

      onSave(saved)

      setForm(initialForm)

      onClose()
    } catch (error) {
      console.log(error)
      alert("Error saving client")
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">

        <h2 className="text-2xl font-bold text-white mb-6">New Client</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

          <div>
            <label className="text-sm text-zinc-400">Full name *</label>
            <input
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              placeholder="Carlos García"
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Phone (10 digits) *</label>
            <input
              name="telefono"
              value={form.telefono}
              onChange={handleChange}
              placeholder="6561234567"
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Country</label>
            <input
              name="country"
              value={form.country}
              onChange={handleChange}
              placeholder="Mexico"
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Customer ID</label>
            <input
              name="customerId"
              type="number"
              value={form.customerId}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Collector ID</label>
            <input
              name="collectorId"
              type="number"
              value={form.collectorId}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Team</label>
            <input
              name="team"
              value={form.team}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Team Leader</label>
            <input
              name="teamLeader"
              value={form.teamLeader}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Collector</label>
            <input
              name="collector"
              value={form.collector}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Invoice Number</label>
            <input
              name="invoiceNumber"
              value={form.invoiceNumber}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Create Date</label>
            <input
              name="createDate"
              type="date"
              value={form.createDate}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Due Date</label>
            <input
              name="dueDate"
              type="date"
              value={form.dueDate}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Aging Days</label>
            <input
              name="agingDays"
              type="number"
              value={form.agingDays}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Loan / Lease</label>
            <select
              name="loanLease"
              value={form.loanLease}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            >
              <option value="">—</option>
              <option value="Loan">Loan</option>
              <option value="Lease">Lease</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-400">Debt ($MXN)</label>
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
            <label className="text-sm text-zinc-400">USD Amount</label>
            <input
              name="usdAmount"
              type="number"
              value={form.usdAmount}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Channel</label>
            <select
              name="canal"
              value={form.canal}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            >
              <option value="WhatsApp">WhatsApp</option>
              <option value="SMS">SMS</option>
              <option value="Llamada">Call</option>
              <option value="Email">Email</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-400">AI Risk</label>
            <select
              name="riesgo"
              value={form.riesgo}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-400">Contact</label>
            <input
              name="contact"
              value={form.contact}
              onChange={handleChange}
              placeholder="Name or phone of the contact"
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Next Action</label>
            <input
              name="nextAction"
              value={form.nextAction}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Payment Promise ($)</label>
            <input
              name="paymentPromiseAmount"
              type="number"
              value={form.paymentPromiseAmount}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Date Promise</label>
            <input
              name="datePromise"
              type="date"
              value={form.datePromise}
              onChange={handleChange}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />
          </div>

          <div className="col-span-2 md:col-span-3">
            <label className="text-sm text-zinc-400">Notes</label>
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
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500"
          >
            Save client
          </button>
        </div>

      </div>
    </div>
  )
}
