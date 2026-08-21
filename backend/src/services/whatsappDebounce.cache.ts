// Agrupa mensajes de WhatsApp que llegan en ráfaga (el cliente escribe en
// varios renglones seguidos) antes de que el guion automatizado los procese
// como un solo turno. Sin esto, el bot contestaría a cada fragmento por
// separado en vez de esperar a que el cliente termine de escribir.

interface PendingBatch {
  texts: string[]
  timer: NodeJS.Timeout
  firstMessageAt: number
}

const pending = new Map<string, PendingBatch>()

// Tiempo de silencio que esperamos tras el último mensaje antes de procesar.
const DEBOUNCE_MS = 6_000
// Tope máximo de espera desde el primer mensaje del lote, por si el cliente
// no deja de escribir — evita dejarlo sin respuesta indefinidamente.
const MAX_BATCH_MS = 20_000

// key = conversationId. onFlush recibe el texto combinado (un mensaje por línea).
export function bufferMessage(
  key: string,
  text: string,
  onFlush: (combinedText: string) => void | Promise<void>
): void {
  const existing = pending.get(key)

  if (existing) {
    clearTimeout(existing.timer)
    existing.texts.push(text)

    const elapsed = Date.now() - existing.firstMessageAt
    const delay = elapsed >= MAX_BATCH_MS ? 0 : DEBOUNCE_MS

    existing.timer = setTimeout(() => flush(key, onFlush), delay)
    return
  }

  pending.set(key, {
    texts: [text],
    firstMessageAt: Date.now(),
    timer: setTimeout(() => flush(key, onFlush), DEBOUNCE_MS),
  })
}

function flush(key: string, onFlush: (combinedText: string) => void | Promise<void>): void {
  const entry = pending.get(key)
  if (!entry) return
  pending.delete(key)

  const combined = entry.texts.join('\n')
  Promise.resolve(onFlush(combined)).catch((err) =>
    console.error('[WhatsAppDebounce] Error procesando lote:', err)
  )
}
