import { useEffect, useState } from "react"
import { getAutomationSettings, updateManualCallFlow, type ManualCallFlow } from "../services/settings"

const FLOW_LABEL: Record<ManualCallFlow, string> = {
  auto: "Auto (by days overdue)",
  preventive: "Preventive 0 days",
  overdue_1_30: "1–30 days overdue",
}

// Guion de las llamadas MANUALES (botones "Call" / "Test ElevenLabs") — para probar cada
// diagrama con cualquier cliente. Las llamadas automáticas no se ven afectadas: siempre
// usan el guion según los días de atraso. Sin contraseña (a diferencia de Auto Calls /
// Auto voice): solo cambia las llamadas que el propio usuario dispara.
export default function ManualCallFlowSelect() {
  const [flow, setFlow] = useState<ManualCallFlow | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAutomationSettings()
      .then((d) => setFlow(d.manualCallFlow ?? "auto"))
      .catch(() => setFlow("auto"))
  }, [])

  async function handleChange(next: ManualCallFlow) {
    const previous = flow
    setFlow(next)
    setSaving(true)
    try {
      const result = await updateManualCallFlow(next)
      setFlow(result.manualCallFlow)
    } catch {
      setFlow(previous)
      alert("Error updating the manual call script")
    } finally {
      setSaving(false)
    }
  }

  return (
    <label
      title="Script used by manual calls (Call / Test ElevenLabs). Automatic calls always use the script for the client's days overdue."
      className={`flex items-center gap-2 rounded-xl px-4 py-3 font-medium transition-colors ${
        flow && flow !== "auto" ? "bg-amber-600/90 text-white" : "bg-zinc-800"
      }`}
    >
      <span className="whitespace-nowrap">Manual script:</span>
      <select
        value={flow ?? "auto"}
        disabled={flow === null || saving}
        onChange={(e) => handleChange(e.target.value as ManualCallFlow)}
        className="bg-transparent font-medium outline-none cursor-pointer disabled:cursor-wait"
      >
        {(Object.keys(FLOW_LABEL) as ManualCallFlow[]).map((key) => (
          <option key={key} value={key} className="bg-zinc-900 text-white">
            {FLOW_LABEL[key]}
          </option>
        ))}
      </select>
    </label>
  )
}
