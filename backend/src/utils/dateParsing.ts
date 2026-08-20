// Extracts a concrete date offset from a Spanish WhatsApp message.
// Returns number of days from today, or null if no clear date found.
export function extractDaysOffset(text: string): number | null {
  const t = text.toLowerCase()

  if (/(hoy|ahorita|hoy mismo|en la tarde|en la mañana)/.test(t)) return 0
  if (/(mañana)/.test(t)) return 1
  if (/(pasado mañana)/.test(t)) return 2

  const dayMap: Record<string, number> = {
    lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 0,
  }
  const today = new Date().getDay() // 0=Sun
  for (const [name, dayNum] of Object.entries(dayMap)) {
    if (t.includes(name)) {
      let diff = dayNum - today
      if (diff <= 0) diff += 7 // next occurrence
      return diff
    }
  }

  if (/(esta semana|fin de semana)/.test(t)) return 3
  if (/(próxima semana|semana que entra|semana próxima)/.test(t)) return 7
  if (/(quincena|quincenal)/.test(t)) return 15
  if (/(mes que entra|próximo mes)/.test(t)) return 30

  return null // unknown
}

export function addDays(base: Date, days: number): Date {
  const result = new Date(base)
  result.setDate(result.getDate() + days)
  return result
}
