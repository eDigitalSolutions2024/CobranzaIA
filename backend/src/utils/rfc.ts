// RFC (Registro Federal de Contribuyentes) — identificador fiscal mexicano.
// Persona física: 4 letras + 6 dígitos (AAMMDD de nacimiento) + 3 caracteres (homoclave) = 13.
// Persona moral: 3 letras + 6 dígitos + 3 caracteres (homoclave) = 12.
// Solo se valida formato/estructura, no se verifica contra el SAT (requeriría un servicio de
// terceros de paga, el SAT no tiene API pública gratuita).
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/

export function normalizeRFC(rfc: string): string {
  return rfc.trim().toUpperCase().replace(/\s+/g, '')
}

export function isValidRFC(rfc: string): boolean {
  const normalized = normalizeRFC(rfc)
  if (!RFC_REGEX.test(normalized)) return false

  const digits = normalized.match(/\d{6}/)?.[0]
  if (!digits) return false
  const month = parseInt(digits.slice(2, 4), 10)
  const day = parseInt(digits.slice(4, 6), 10)
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}
