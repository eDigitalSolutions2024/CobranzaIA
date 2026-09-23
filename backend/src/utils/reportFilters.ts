// Compartido entre GET /calls, GET /calls/export y GET /clients/export — los 5 filtros
// de "Reporte Filters" (ver tarjeta del tablero): Country / Collector ID / Team /
// Team Leader / Collector (ver models/Client.ts).
export const CLIENT_REPORT_FIELDS = 'name phone country collectorId team teamLeader collector'

// country/team/teamLeader/collector son match exacto (vienen de un <select> con los
// valores ya existentes, no de texto libre); collectorId se castea a Number porque así
// vive en el modelo.
export function buildClientReportFilter(query: Record<string, any>): Record<string, any> {
  const filter: Record<string, any> = {}
  if (query.country) filter.country = query.country
  if (query.team) filter.team = query.team
  if (query.teamLeader) filter.teamLeader = query.teamLeader
  if (query.collector) filter.collector = query.collector
  if (query.collectorId) {
    const n = Number(query.collectorId)
    if (!Number.isNaN(n)) filter.collectorId = n
  }
  return filter
}
