import axios from 'axios'

export interface PaymentVerification {
  exists: boolean
  amount?: number
  date?: string
  source: 'provider' | 'unconfigured'
}

// Punto de integración con el sistema de pagos real del cliente — a definir con ellos
// (pasarela, banco, ERP, etc.). Mientras PAYMENTS_PROVIDER_URL no esté configurado,
// siempre responde "no encontrado" para no bloquear el flujo de la llamada.
// Contrato esperado del proveedor: GET {PAYMENTS_PROVIDER_URL}/verify?clientId=...
//   -> { exists: boolean, amount?: number, date?: "YYYY-MM-DD" }
export async function verifyPayment(clientId?: string | null): Promise<PaymentVerification> {
  const baseUrl = process.env.PAYMENTS_PROVIDER_URL

  if (!clientId || !baseUrl) {
    console.warn(
      '[Payments] verify_payment sin integración configurada (falta PAYMENTS_PROVIDER_URL) — respondiendo "no encontrado"'
    )
    return { exists: false, source: 'unconfigured' }
  }

  try {
    const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/verify`, {
      params: { clientId },
      headers: process.env.PAYMENTS_PROVIDER_API_KEY
        ? { Authorization: `Bearer ${process.env.PAYMENTS_PROVIDER_API_KEY}` }
        : undefined,
      timeout: 5000,
    })

    return {
      exists: Boolean(response.data?.exists),
      amount: typeof response.data?.amount === 'number' ? response.data.amount : undefined,
      date: typeof response.data?.date === 'string' ? response.data.date : undefined,
      source: 'provider',
    }
  } catch (error) {
    console.error('[Payments] Error consultando proveedor de pagos, usando fallback:', error)
    return { exists: false, source: 'unconfigured' }
  }
}
