import { useRef, useState } from "react"
import { toJpeg } from "html-to-image"
import { Download } from "lucide-react"
import { CallTimelineView, dispositionLabel, formatDuration } from "./CallTimeline"

function fileName(clientName: string, createdAt: string): string {
  const slug = clientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return `transcript-${slug || "call"}-${new Date(createdAt).toISOString().slice(0, 10)}.jpg`
}

// Botón que descarga el transcript de la llamada en JPG. La imagen se genera de una copia fuera de pantalla
// (sin límite de alto), así sale la conversación completa aunque en el modal haya que hacer scroll.
export default function TranscriptDownload({ call, clientName, clientPhone }: { call: any; clientName: string; clientPhone: string }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  // Cualquier llamada con transcript, sin importar su disposición
  if (!call.transcript?.length) return null

  async function handleDownload() {
    if (!sheetRef.current) return
    setDownloading(true)
    try {
      // data URL en base64 (image/jpeg), a doble resolución para que el texto se lea nítido
      const dataUrl = await toJpeg(sheetRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: "#011631" })
      const link = document.createElement("a")
      link.href = dataUrl
      link.download = fileName(clientName, call.createdAt)
      link.click()
    } catch (error) {
      console.error("Error generating transcript image:", error)
      alert("Error generating the transcript image")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
      >
        <Download size={14} />
        {downloading ? "Generating..." : "Download transcript (JPG)"}
      </button>

      <div aria-hidden className="fixed top-0 -left-[10000px] pointer-events-none">
        <div ref={sheetRef} className="w-[672px] bg-[var(--bg-main)] text-white">
          <div className="border-b border-zinc-800 p-5">
            <h2 className="text-lg font-semibold">{clientName}</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              {clientPhone} · {new Date(call.createdAt).toLocaleString("en-US")}
            </p>
            <p className="text-sm text-zinc-400 mt-0.5">
              Duration: {formatDuration(call.durationSeconds)} · Disposition: {dispositionLabel(call.disposition)}
            </p>
          </div>
          {call.summary && (
            <div className="border-b border-zinc-800 p-5">
              <p className="text-xs text-zinc-500 mb-1">Summary</p>
              <p className="text-sm text-zinc-200 leading-relaxed">{call.summary}</p>
            </div>
          )}
          <div className="p-5 space-y-4">
            <CallTimelineView call={call} clientCopy />
          </div>
        </div>
      </div>
    </>
  )
}
