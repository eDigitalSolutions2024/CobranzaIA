import { useEffect, useState } from "react"
import { createClient, updateClient } from "../services/clients"
import { getExchangeRate } from "../services/settings"
import ExchangeRateModal from "./ExchangeRateModal"

interface Props {
  isOpen: boolean
  client?: any | null
  onClose: () => void
  onSave: (client: any) => void
}

const initialForm = {
  nombre: "",
  telefono: "",
  rfc: "",
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

function computeUsd(deuda: string, rate: number | null): string {
  if (!rate || !deuda) return ""
  const n = Number(deuda)
  if (!Number.isFinite(n)) return ""
  return (n / rate).toFixed(2)
}

function toDateInput(value: any): string {
  if (!value) return ""
  return String(value).slice(0, 10)
}

function clientToForm(client: any) {
  return {
    nombre: client.name ?? "",
    telefono: client.phone ?? "",
    rfc: client.rfc ?? "",
    email: "",
    deuda: client.debt != null ? String(client.debt) : "",
    canal: client.channel ?? "WhatsApp",
    riesgo: client.risk ?? "medium",
    notas: client.notes ?? "",
    country: client.country ?? "Mexico",
    customerId: client.customerId != null ? String(client.customerId) : "",
    collectorId: client.collectorId != null ? String(client.collectorId) : "",
    team: client.team ?? "",
    teamLeader: client.teamLeader ?? "",
    collector: client.collector ?? "",
    invoiceNumber: client.invoiceNumber ?? "",
    createDate: toDateInput(client.createDate),
    dueDate: toDateInput(client.dueDate),
    agingDays: client.agingDays != null ? String(client.agingDays) : "",
    loanLease: client.loanLease ?? "",
    usdAmount: client.usdAmount != null ? String(client.usdAmount) : "",
    contact: client.contact ?? "",
    nextAction: client.nextAction ?? "",
    paymentPromiseAmount: client.paymentPromiseAmount != null ? String(client.paymentPromiseAmount) : "",
    datePromise: toDateInput(client.datePromise),
  }
}

export default function NewClientModal({ isOpen, client, onClose, onSave }: Props) {
  const isEditMode = Boolean(client)
  const [form, setForm] = useState(initialForm)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [usdTouched, setUsdTouched] = useState(false)
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const [errors, setErrors] = useState<{ nombre?: boolean; telefono?: boolean; deuda?: boolean }>({})

  useEffect(() => {
    if (!isOpen) return
    setForm(client ? clientToForm(client) : initialForm)
    // En edición ya hay un usdAmount guardado — no lo pisamos con el cálculo automático
    // hasta que el usuario toque el campo de deuda o el de USD explícitamente.
    setUsdTouched(Boolean(client))
    setErrors({})
    getExchangeRate()
      .then((data) => setExchangeRate(data.usdMxn))
      .catch(() => {})
  }, [isOpen, client])

  if (!isOpen) return null

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target

    if (name === "deuda") {
      setErrors((prev) => ({ ...prev, deuda: false }))
      setForm((f) => ({
        ...f,
        deuda: value,
        usdAmount: usdTouched ? f.usdAmount : computeUsd(value, exchangeRate),
      }))
      return
    }

    if (name === "usdAmount") {
      setUsdTouched(true)
      setForm((f) => ({ ...f, usdAmount: value }))
      return
    }

    if (name === "nombre" || name === "telefono") {
      setErrors((prev) => ({ ...prev, [name]: false }))
    }

    setForm((f) => ({ ...f, [name]: value }))
  }

  async function handleSubmit() {
    const newErrors: { nombre?: boolean; telefono?: boolean; deuda?: boolean } = {}
    if (!form.nombre.trim()) newErrors.nombre = true
    if (!form.telefono.trim()) newErrors.telefono = true
    if (!form.deuda.trim()) newErrors.deuda = true

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    try {
      const payload = {
        name: form.nombre,
        phone: form.telefono,
        rfc: form.rfc.trim() ? form.rfc.trim().toUpperCase() : null,
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

      const saved = isEditMode ? await updateClient(client._id, payload) : await createClient(payload)

      onSave(saved)

      setForm(initialForm)
      setUsdTouched(false)
      setErrors({})

      onClose()
    } catch (error: any) {
      console.log(error)
      alert(error.message || "Error saving client")
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">

        <h2 className="text-2xl font-bold text-white mb-6">{isEditMode ? "Edit Client" : "New Client"}</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

          <div>
            <label className="text-sm text-zinc-400">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              placeholder="Carlos García"
              className={`w-full mt-1 bg-zinc-950 border rounded-lg p-3 text-white ${
                errors.nombre ? "border-red-500" : "border-zinc-700"
              }`}
            />
            {errors.nombre && <p className="mt-1 text-xs text-red-500">This field is required</p>}
          </div>

          <div>
            <label className="text-sm text-zinc-400">
              Phone (10 digits) <span className="text-red-500">*</span>
            </label>
            <input
              name="telefono"
              value={form.telefono}
              onChange={handleChange}
              placeholder="6561234567"
              className={`w-full mt-1 bg-zinc-950 border rounded-lg p-3 text-white ${
                errors.telefono ? "border-red-500" : "border-zinc-700"
              }`}
            />
            {errors.telefono && <p className="mt-1 text-xs text-red-500">This field is required</p>}
          </div>

          <div>
            <label className="text-sm text-zinc-400">RFC</label>
            <input
              name="rfc"
              value={form.rfc}
              onChange={handleChange}
              placeholder="GARC800101AB1"
              maxLength={13}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white uppercase"
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
            <label className="text-sm text-zinc-400">
              Debt ($MXN) <span className="text-red-500">*</span>
            </label>
            <input
              name="deuda"
              type="number"
              value={form.deuda}
              onChange={handleChange}
              placeholder="4500"
              className={`w-full mt-1 bg-zinc-950 border rounded-lg p-3 text-white ${
                errors.deuda ? "border-red-500" : "border-zinc-700"
              }`}
            />
            {errors.deuda && <p className="mt-1 text-xs text-red-500">This field is required</p>}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400">USD Amount</label>
              <button
                type="button"
                onClick={() => setRateModalOpen(true)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Rate: {exchangeRate ? exchangeRate.toFixed(2) : "…"} · Edit
              </button>
            </div>
            <input
              name="usdAmount"
              type="number"
              value={form.usdAmount}
              onChange={handleChange}
              placeholder="Auto-calculated"
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
            className="px-5 py-2 rounded-lg bg-brand hover:bg-brand-light"
          >
            {isEditMode ? "Save changes" : "Save client"}
          </button>
        </div>

      </div>

      <ExchangeRateModal
        isOpen={rateModalOpen}
        currentRate={exchangeRate ?? 17.5}
        onClose={() => setRateModalOpen(false)}
        onUpdated={(newRate) => {
          setExchangeRate(newRate)
          setForm((f) => (usdTouched ? f : { ...f, usdAmount: computeUsd(f.deuda, newRate) }))
        }}
      />
    </div>
  )
}
