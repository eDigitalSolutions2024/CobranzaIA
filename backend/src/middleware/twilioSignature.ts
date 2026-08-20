import { Request, Response, NextFunction } from 'express'
import twilio from 'twilio'

// Validates that incoming requests actually come from Twilio.
// Without this, anyone who discovers the webhook URL can inject fake calls/speech.
// Skipped automatically when TWILIO_AUTH_TOKEN is not configured (dev/test mode).
export function validateTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken || authToken === 'your_twilio_auth_token') {
    // Dev mode — skip validation
    next()
    return
  }

  const signature = req.headers['x-twilio-signature'] as string | undefined
  if (!signature) {
    res.status(403).send('Forbidden: Missing Twilio signature')
    return
  }

  const host = req.headers['x-forwarded-host'] ?? req.get('host') ?? ''
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https'
  const url = `${proto}://${host}${req.originalUrl}`

  const isValid = twilio.validateRequest(authToken, signature, url, req.body as Record<string, string>)

  if (!isValid) {
    console.warn('[Security] Firma Twilio inválida para:', url)
    res.status(403).send('Forbidden: Invalid Twilio signature')
    return
  }

  next()
}
