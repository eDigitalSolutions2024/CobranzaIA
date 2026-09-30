// Cuántos pasos tiene el ciclo automático de cobranza (ver autoCallScheduler.service.ts):
// 1 = llamada, 2 = reintento de llamada, 3 = WhatsApp, 4 = WhatsApp final. Por defecto 4
// (el ciclo completo). Con AUTO_CYCLE_STEPS=1 solo se hace la primera llamada — sin
// reintento ni mensajes — pensado para la primera semana de prueba en producción, donde
// se quiere ver únicamente si la llamada entró ("0/1" → "1/1" en Auto Outreach).
function readCycleSteps(): number {
  const n = Number(process.env.AUTO_CYCLE_STEPS)
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 4
}

export const AUTO_CYCLE_STEPS = readCycleSteps()
