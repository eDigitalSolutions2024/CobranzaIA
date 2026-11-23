// Compartido entre GET /calls, GET /calls/export y GET /clients/export — los 5 filtros
// de "Reporte Filters" (ver tarjeta del tablero): Country / Collector ID / Team /
// Team Leader / Collector (ver models/Client.ts).
export const CLIENT_REPORT_FIELDS = 'name phone country collectorId team teamLeader collector'

// Cada filtro acepta varios valores a la vez, separados por "|" (ej. "Mexico|Peru"): los
// valores de un mismo filtro se suman (OR) y los distintos filtros se combinan (AND). Se usa
// "|" y no coma porque algunos valores llevan comas (ej. disposiciones).
export function splitFilterValues(raw: unknown): string[] {
  return String(raw ?? '')
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean)
}

// country/team/teamLeader/collector son match exacto (vienen de un <select> con los
// valores ya existentes, no de texto libre); collectorId se castea a Number porque así
// vive en el modelo.
export function buildClientReportFilter(query: Record<string, any>): Record<string, any> {
  const filter: Record<string, any> = {}
  for (const field of ['country', 'team', 'teamLeader', 'collector'] as const) {
    const values = splitFilterValues(query[field])
    if (values.length > 0) filter[field] = { $in: values }
  }
  const ids = splitFilterValues(query.collectorId).map(Number).filter((n) => !Number.isNaN(n))
  if (ids.length > 0) filter.collectorId = { $in: ids }
  return filter
}
