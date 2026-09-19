import ExchangeRate from '../models/ExchangeRate'

// Trae todas las tasas vigentes de una sola vez — evita ida-y-vueltas a Mongo por cada
// factura al convertir en batch (import masivo). MXN siempre vale 1 (moneda base), no
// se guarda como documento en ExchangeRate.
export async function loadExchangeRates(): Promise<Map<string, number>> {
  const rates = await ExchangeRate.find().lean()
  const map = new Map<string, number>()
  for (const r of rates) {
    if (r.currencyCode) map.set(r.currencyCode, r.rateToMxn)
  }
  map.set('MXN', 1)
  return map
}

// Convierte `amount` (en `currencyCode`) a pesos usando el mapa de tasas ya cargado.
// Si currencyCode viene vacío se asume MXN (la mayoría de las filas no traen esa
// columna). Si la moneda no tiene tasa configurada, regresa null — NUNCA se asume 1:1
// a ciegas, porque eso es exactamente el bug que se está corrigiendo (guardar dólares
// como si fueran pesos).
export function toMxn(
  amount: number | null | undefined,
  currencyCode: string | null | undefined,
  rates: Map<string, number>
): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null
  const code = (currencyCode || 'MXN').toUpperCase().trim()
  const rate = rates.get(code)
  if (rate === undefined) return null
  return Math.round(amount * rate * 100) / 100
}
