import { useEffect, useState } from "react"
import { getAutomationSettings, updateVoiceEngine, type VoiceEngine } from "../services/settings"

const ENGINE_LABEL: Record<VoiceEngine, string> = { openai: "OpenAI", elevenlabs: "ElevenLabs" }
const ENGINE_DETAIL: Record<VoiceEngine, string> = {
  openai: "OpenAI Realtime (the original voice engine).",
  elevenlabs: "Deepgram + Claude + ElevenLabs voice.",
}

// Selector del motor de voz de las llamadas AUTOMÁTICAS — pide contraseña igual que el
// interruptor de Auto Calls porque cambia qué motor le habla a clientes reales. Solo
// afecta las llamadas que se disparen a partir de ese momento; una llamada en curso
// termina con el motor con el que arrancó. El botón "Call" manual siempre usa OpenAI.
export default function AutoCallEngineToggle() {
  const [engine, setEngine] = useState<VoiceEngine | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAutomationSettings()
      .then((d) => setEngine(d.voiceEngine ?? "openai"))
      .catch(() => setEngine("openai"))
  }, [])

  const target: VoiceEngine = engine === "elevenlabs" ? "openai" : "elevenlabs"

  function openModal() {
    setPassword("")
    setError("")
    setModalOpen(true)
  }

  async function handleConfirm() {
    setError("")
    if (!password) {
      setError("Enter your system password to confirm")
      return
    }
    setSaving(true)
    try {
      const result = await updateVoiceEngine(target, password)
      setEngine(result.voiceEngine)
      setModalOpen(false)
    } catch (err: any) {
      setError(err.message || "Error updating setting")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        title="Voice engine used by the automatic calls"
        className={`rounded-xl px-5 py-3 font-medium cursor-pointer transition-colors ${
          engine === "elevenlabs" ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-zinc-800 hover:bg-zinc-700"
        }`}
      >
        Auto voice: {engine === null ? "…" : ENGINE_LABEL[engine]}
      </button>

      {modalOpen && engine && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[var(--bg-main)] border border-[var(--border)] rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-1">Switch automatic calls to {ENGINE_LABEL[target]}?</h3>
            <p className="text-sm text-zinc-400 mb-4">
              {ENGINE_DETAIL[target]} It applies to automatic calls placed from now on; a call already in
              progress finishes with its current engine. The manual "Call" button keeps using OpenAI.
            </p>

            <label className="text-sm text-zinc-400">System password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white"
            />

            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
