// Normaliza cualquier formato de entrada a E.164 México: +52XXXXXXXXXX.
// Evita que un mismo cliente termine con distintas representaciones del
// mismo número (con/sin +, con/sin el "1" móvil) esparcidas por la base,
// que es justo lo que rompía el emparejamiento de conversaciones de WhatsApp.
export function normalizeMexicanPhone(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  // Ya trae código de país + "1" móvil (52 1 XXXXXXXXXX)
  if (digits.startsWith('521') && digits.length === 13) return `+${digits}`
  // Ya trae código de país sin el "1" móvil (52 XXXXXXXXXX)
  if (digits.startsWith('52') && digits.length === 12) return `+${digits}`
  // Número local de 10 dígitos — agregamos +52 por default
  if (digits.length === 10) return `+52${digits}`
  // Formato no reconocido — lo dejamos como vino, con + al frente
  return `+${digits}`
}
