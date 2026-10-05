// Verificación de firma de los webhooks públicos (Twilio y Meta/WhatsApp). Sin ella, cualquiera
// que conozca la URL puede simular llamadas o mensajes de clientes (y gastar Claude, que se
// cobra por mensaje procesado).
//
// WEBHOOK_SIGNATURE_MODE:
//   'log'     (default) — revisa la firma y registra en el log las inválidas, pero NO bloquea.
//             Es el modo para desplegar: si el log sale limpio un día, las URL coinciden.
//   'enforce' — rechaza con 403 las peticiones con firma inválida o ausente.
//   'off'     — no revisa nada.
export type SignatureMode = 'off' | 'log' | 'enforce'

export function signatureMode(): SignatureMode {
  const raw = (process.env.WEBHOOK_SIGNATURE_MODE ?? 'log').trim().toLowerCase()
  return raw === 'enforce' || raw === 'off' ? raw : 'log'
}

// Línea de arranque: deja claro en el log qué se está verificando y qué falta configurar
export function logWebhookSecurityStatus(): void {
  const mode = signatureMode()
  const twilio = process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_AUTH_TOKEN !== 'your_twilio_auth_token'
  const meta = Boolean(process.env.META_APP_SECRET)
  console.log(
    `[Security] Firma de webhooks: modo "${mode}" · Twilio ${twilio ? 'listo' : 'SIN TOKEN (no se verifica)'} · ` +
      `Meta ${meta ? 'listo' : 'SIN META_APP_SECRET (no se verifica)'}`
  )
  if (mode === 'log') {
    console.log('[Security] Modo "log": se registran las firmas inválidas pero NO se bloquean. Para bloquear: WEBHOOK_SIGNATURE_MODE=enforce')
  }
}

// Guarda el cuerpo original (sin convertir a JSON) solo para el webhook de WhatsApp: Meta firma
// esos bytes exactos. Se usa como `verify` de express.json() en server.ts. Solo para esa ruta,
// para no retener en memoria el cuerpo del resto del tráfico.
export function captureWebhookRawBody(req: { url?: string }, _res: unknown, buf: Buffer): void {
  if (req.url?.startsWith('/api/webhook')) {
    ;(req as { rawBody?: Buffer }).rawBody = buf
  }
}
