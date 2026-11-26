// Fin del mes en curso, hora CDMX — usado para pausar el ciclo automático de cobranza
// (ver tarjeta "Exclusión automática de clientes del ciclo mensual de cobranza") hasta
// que alguien verifique de verdad un pago reportado/en proceso/domiciliado. Mismo patrón
// de zona horaria que todayMexicoCityUtc en invoiceSummary.service.ts.
export function endOfCurrentMonthMexicoCity(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [y, m] = parts.split('-').map(Number)
  // Día 0 del mes siguiente = último día del mes actual. 23:59:59 de CDMX son las 05:59:59 UTC del día
  // siguiente (hora 29): con 23:59 UTC la exclusión vencía a las 17:59 del último día y el lote de las 18:00 llamaba.
  return new Date(Date.UTC(y, m, 0, 29, 59, 59, 999))
}
