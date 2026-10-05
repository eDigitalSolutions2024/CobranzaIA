import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { signatureMode } from '../config/webhookSecurity'

// Verifica que el webhook de WhatsApp viene de Meta: el encabezado X-Hub-Signature-256 es
// "sha256=" + HMAC-SHA256 del cuerpo ORIGINAL (sin convertir a JSON) con el App Secret de la
// app de Meta (META_APP_SECRET, en Configuración → Básica de la app). Por eso server.ts
// guarda el cuerpo original en req.rawBody para esta ruta. Ver WEBHOOK_SIGNATURE_MODE en
// config/webhookSecurity.ts: en modo 'log' solo registra.
// Sin META_APP_SECRET no se puede verificar: se deja pasar y se avisa al arrancar.
let validLogged = 0
const VALID_LOGS_TO_SHOW = 5
let warnedNoSecret = false

export function validateMetaSignature(req: Request, res: Response, next: NextFunction): void {
  const mode = signatureMode()
  const secret = process.env.META_APP_SECRET
  if (mode === 'off') {
    next()
    return
  }
  if (!secret) {
    if (!warnedNoSecret) {
      warnedNoSecret = true
      console.warn('[Security] META_APP_SECRET no está configurado: el webhook de WhatsApp NO se verifica')
    }
    next()
    return
  }

  const header = req.headers['x-hub-signature-256']
  const signature = typeof header === 'string' ? header : undefined
  const raw = (req as Request & { rawBody?: Buffer }).rawBody

  let failure: string | null = null
  if (!signature) failure = 'falta el encabezado X-Hub-Signature-256'
  else if (!raw) failure = 'no se guardó el cuerpo original (rawBody)'
  else {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      if (validLogged < VALID_LOGS_TO_SHOW) {
        validLogged++
        console.log(`[Security] Firma Meta válida (${validLogged}/${VALID_LOGS_TO_SHOW})`)
      }
      next()
      return
    }
    failure = 'la firma no coincide (¿META_APP_SECRET correcto?)'
  }

  console.warn(`[Security] Firma Meta inválida en ${req.method} ${req.path}: ${failure}${mode === 'log' ? ' — modo log, se deja pasar' : ''}`)
  if (mode === 'enforce') {
    res.status(403).send('Forbidden: Invalid Meta signature')
    return
  }
  next()
}
