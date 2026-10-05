import { Request, Response, NextFunction } from 'express'
import twilio from 'twilio'
import { signatureMode } from '../config/webhookSecurity'

// Verifica que la petición realmente viene de Twilio (firma X-Twilio-Signature). Ver
// WEBHOOK_SIGNATURE_MODE en config/webhookSecurity.ts: en modo 'log' solo registra.
// Sin TWILIO_AUTH_TOKEN configurado (dev/test) no se verifica.
//
// Twilio firma con la URL EXACTA a la que mandó la petición. Detrás de un proxy esa URL no
// siempre se reconstruye igual, así que se prueban las formas posibles y basta que una
// coincida: PUBLIC_URL (la que usamos al crear las llamadas), la de los encabezados
// x-forwarded-* del proxy, y la del propio servidor.
let validLogged = 0
const VALID_LOGS_TO_SHOW = 5

function candidateUrls(req: Request): string[] {
  const urls = new Set<string>()
  const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
  if (publicUrl) urls.add(`${publicUrl}${req.originalUrl}`)
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.get('host') ?? ''
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol ?? 'https'
  if (host) urls.add(`${proto}://${host}${req.originalUrl}`)
  const ownHost = req.get('host')
  if (ownHost) urls.add(`${req.protocol}://${ownHost}${req.originalUrl}`)
  return [...urls]
}

export function validateTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  const mode = signatureMode()
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (mode === 'off' || !authToken || authToken === 'your_twilio_auth_token') {
    next()
    return
  }

  const signature = req.headers['x-twilio-signature'] as string | undefined
  let failure: string | null = null
  if (!signature) {
    failure = 'falta el encabezado X-Twilio-Signature'
  } else {
    const params = (req.body ?? {}) as Record<string, string>
    const matched = candidateUrls(req).find((url) => twilio.validateRequest(authToken, signature, url, params))
    if (matched) {
      if (validLogged < VALID_LOGS_TO_SHOW) {
        validLogged++
        console.log(`[Security] Firma Twilio válida (${validLogged}/${VALID_LOGS_TO_SHOW}) para ${req.path} con URL ${matched.replace(/\?.*/, '')}`)
      }
      next()
      return
    }
    failure = `firma no coincide con ninguna URL probada (${candidateUrls(req).map((u) => u.replace(/\?.*/, '')).join(' | ')})`
  }

  console.warn(`[Security] Firma Twilio inválida en ${req.method} ${req.path}: ${failure}${mode === 'log' ? ' — modo log, se deja pasar' : ''}`)
  if (mode === 'enforce') {
    res.status(403).send('Forbidden: Invalid Twilio signature')
    return
  }
  next()
}
