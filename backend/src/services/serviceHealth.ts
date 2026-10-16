// Interruptor de emergencia: cuando un proveedor externo se queda sin saldo o sin créditos
// (ElevenLabs "quota_exceeded", Anthropic "credit balance is too low") cada llamada nueva conecta,
// el agente no puede hablar o pensar, y la llamada se pierde — gastando Twilio y un intento del
// ciclo de cobranza de cada cliente (en producción el 6 de octubre se perdieron así decenas).
// Al detectarlo se marca el servicio como caído y el scheduler deja de lanzar llamadas
// automáticas hasta que pase la ventana (o se reinicie el servidor).
const DEFAULT_MINUTES = 30
const down = new Map<string, { until: number; reason: string }>()

export function markServiceDown(name: string, reason: string, minutes = DEFAULT_MINUTES): void {
  const already = down.get(name)
  const until = Date.now() + minutes * 60_000
  down.set(name, { until, reason })
  if (!already || already.until < Date.now()) {
    console.error(`[ServiceHealth] ${name} CAÍDO por ${minutes} min — se pausan las llamadas automáticas. Motivo: ${reason}`)
  }
}

// Primer servicio caído que siga dentro de su ventana, o null si todo está bien
export function activeServiceOutage(): { name: string; reason: string } | null {
  const now = Date.now()
  for (const [name, info] of down) {
    if (info.until > now) return { name, reason: info.reason }
    down.delete(name)
  }
  return null
}
