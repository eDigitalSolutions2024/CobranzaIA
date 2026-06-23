import twilio from 'twilio'

const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID  ?? ''
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN   ?? ''
export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? ''

const PLACEHOLDER_SID   = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
const PLACEHOLDER_TOKEN = 'your_twilio_auth_token'

export function validateTwilioConfig(): void {
  const missing: string[] = []

  if (!TWILIO_ACCOUNT_SID || TWILIO_ACCOUNT_SID === PLACEHOLDER_SID)
    missing.push('TWILIO_ACCOUNT_SID')
  if (!TWILIO_AUTH_TOKEN || TWILIO_AUTH_TOKEN === PLACEHOLDER_TOKEN)
    missing.push('TWILIO_AUTH_TOKEN')

  if (missing.length > 0) {
    console.warn(`[Twilio] ADVERTENCIA — Variables sin configurar: ${missing.join(', ')}`)
    console.warn('[Twilio] Webhooks de voz activos pero sin verificacion de firma.')
    return
  }

  if (!TWILIO_PHONE_NUMBER || TWILIO_PHONE_NUMBER.includes('X')) {
    console.log('[Twilio] Credenciales OK. Sin numero asignado aun (normal en cuenta Trial).')
  } else {
    console.log('[Twilio] Configuracion completa.')
  }
}

const hasCredentials =
  TWILIO_ACCOUNT_SID !== '' &&
  TWILIO_ACCOUNT_SID !== PLACEHOLDER_SID &&
  TWILIO_AUTH_TOKEN  !== '' &&
  TWILIO_AUTH_TOKEN  !== PLACEHOLDER_TOKEN

export const twilioClient = hasCredentials
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null
