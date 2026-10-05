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

// Duración máxima de una llamada de voz (Twilio la corta sola). Antes era fijo en 10 min:
// en la primera semana de producción 4 llamadas llegaron a ese límite (casi todas atoradas
// en menús automáticos) y sumaron 36 de los 128 minutos totales. Una llamada real de
// cobranza dura ~1.5 min (mediana), así que 6 min deja margen para negociar.
function readPositiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export const VOICE_MAX_CALL_SECONDS = readPositiveInt('VOICE_MAX_CALL_SECONDS', 360)

// Cuánto espera el agente EN SILENCIO (menú automático, música, "un momento, le comunico")
// a que conteste una persona antes de colgar. Se reinicia cada vez que el agente vuelve a
// hablar. Ver la herramienta esperar_en_linea en voiceConversation.service.ts.
export const HOLD_MAX_SECONDS = readPositiveInt('VOICE_HOLD_MAX_SECONDS', 90)

// Corte por silencio: si pasan estos segundos sin que hable nadie (ni el cliente ni el
// agente, contando lo que todavía está sonando) la llamada se cuelga sola. En la primera
// semana de producción 4 llamadas se conectaron y nadie habló — dos llegaron a los 10 min —
// y sumaron 23 de los 128 minutos totales (18%). No aplica mientras el agente espera en
// línea (esa espera tiene su propio límite, HOLD_MAX_SECONDS) ni mientras Claude piensa.
export const SILENCE_HANGUP_SECONDS = readPositiveInt('VOICE_SILENCE_HANGUP_SECONDS', 30)

// Prototipo: que el agente PRESIONE teclas (marque el 0 de "marque 0 para operadora") dentro
// de la misma llamada, enviando los tonos por el audio, en vez de colgar y volver a marcar
// con una extensión. Ver marcar_digito en voiceConversation.service.ts y utils/dtmf.ts.
// VOICE_DTMF_ENABLED=false lo apaga: el agente solo espera en línea o usa marcar_extension.
export const DTMF_ENABLED = process.env.VOICE_DTMF_ENABLED !== 'false'
// Tope de pulsaciones por llamada (y 2 veces el mismo dígito) para no ciclar contra un menú
// que no responde a los tonos.
export const DTMF_MAX_PRESSES = readPositiveInt('VOICE_DTMF_MAX_PRESSES', 6)

// Marcar la extensión guardada (Client.knownExtension) ANTES de que el agente escuche, con
// sendDigits de Twilio. Apagado por defecto: Twilio presiona las teclas al contestar y recién
// después conecta el audio al agente, así que el agente nunca oye el menú y la llamada queda a
// ciegas (visto en pruebas: silencio y corte a los 30 s mientras con el teléfono sí se oía el
// IVR). En su lugar el agente presiona las teclas DENTRO de la llamada, escuchando el menú
// (ver handleAutomatedMenu en voiceStreamCartesia.controller.ts). VOICE_PREDIAL_EXTENSION=true
// lo reactiva.
export const PREDIAL_EXTENSION = process.env.VOICE_PREDIAL_EXTENSION === 'true'
