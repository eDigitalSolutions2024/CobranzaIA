// Detección y decisión sobre menús automáticos (IVR) a partir de lo que transcribe Deepgram.
// Todo es por reglas de texto: no cuesta nada, no depende de la API de Claude y responde al
// instante. Lo que las reglas no resuelven (un menú raro) sigue pasando al agente con Claude.
//
// Casos reales que cubre (llamadas de producción de octubre 2026):
//   - "…De lo contrario, marque 0 para ser atendido por la operadora."          → presiona 0
//   - "Si desea ser atendido por la operadora, marque 0. … o bien espere…"       → presiona 0
//   - "Para ventas digite 1. Crédito y cobranza, digite 2. … o espere en línea"  → espera en línea
//   - "Lo siento, no lo entiendo. Por favor, vuelva a intentarlo."               → silencio

export interface MenuOption {
  digit: string
  label: string
}

export type MenuDecision =
  | { action: 'press'; digit: string; reason: string }
  | { action: 'wait'; reason: string }

// Lo que funcionó la última vez con este número (ver Client.switchboard)
export interface SwitchboardHint {
  path?: string | null
  outcome?: string | null
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const NUMBER_WORDS: Record<string, string> = {
  cero: '0', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9',
  asterisco: '*', numeral: '#', gato: '#',
}

const DIGIT_COMMAND = /\b(?:marque|marca|digite|oprima|presione|pulse|teclee|ingrese)\s+(?:el\s+|la\s+tecla\s+)?(?:numero\s+)?(\d|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|asterisco|numeral|gato)\b/g

// Pistas de que habla una grabación y no una persona
const IVR_CUES: RegExp[] = [
  /si conoce (el numero de |la )?extension/,
  /espere en (la )?linea/,
  /permanezca en (la )?linea/,
  /(su llamada|esta llamada) (puede ser|sera|esta siendo|podria ser) (grabada|monitoreada)/,
  /para efectos de calidad/,
  /vuelva a intentarlo|no lo entiendo|opcion (no )?valida|marcacion invalida/,
  /for english|press (one|two|\d)/,
  /\b(?:marque|digite|oprima|presione|pulse|teclee)\b[^.?]*(?:\d|asterisco|numeral|extension|operadora)/,
]

// "Un momento", "le comunico"…: puede ser la grabación o una recepcionista. En ambos casos lo
// correcto es esperar sin hablar (protocolo de recepción), pero solo si es corto y sin pregunta
// — "un momento, ¿de parte de quién?" sí requiere contestar.
const TRANSFER_CUE = /\b(un momento|un segundo|transfiriendo|(le|lo|la) (comunico|transfiero|paso)|no cuelgue)\b/

// Operadora, recepción o asesor. 'Asesoría' se deja contar: en una prueba real (Notaría 17) la opción
// "iniciar un trámite o recibir asesoría" fue la que llevó hasta el contacto, aunque su etiqueta no lo
// dijera — por eso lo que de verdad decide es la memoria del cliente (ver SwitchboardHint).
const OPERATOR = /operador|recepcion|atendido por la|atencion (a clientes|personalizada)|asesor/
// Opción que conecta con una persona de la empresa ("contactar a uno de nuestros abogados", "hablar con un
// ejecutivo"): sirve para llegar al contacto.
const HUMAN_CONTACT = /contactar a|hablar con|comunic(ar|arse) con|ejecutivo|abogado|licenciado|asistente|secretaria/
// Nunca se elige: informativas (horario, dirección), cotizaciones, ventas, repetir, otro idioma.
const AVOID = /cotiz|horario|ubicacion|direccion|repetir|ventas|informe|promocion|sucursal|english|ingles|queja|soporte tecnico/
// Etiqueta con una persona con nombre ("la licenciada Gabriela Villalba"): un directorio. Solo se presiona si
// ese nombre es el del contacto; elegir otra persona al azar manda la llamada a quien no es.
const PERSON = /\b(licenciad[oa]|ingenier[oa]|doctor[a]?|contador[a]?|arquitect[oa]|lic|ing|dr|dra)\b\.?\s+[a-z]{3,}/
const NAME_STOPWORDS = new Set(['de', 'del', 'la', 'los', 'las', 'sa', 'cv'])

// ¿La etiqueta menciona al contacto? (algún nombre o apellido de 4+ letras)
function mentionsContact(label: string, contact?: string | null): boolean {
  if (!contact) return false
  return normalize(contact)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !NAME_STOPWORDS.has(w))
    .some((w) => label.includes(w))
}

const PAYABLES = /cuentas por pagar|contabilidad|administracion|tesoreria|finanzas|\bpagos?\b/

export function parseMenuOptions(text: string): MenuOption[] {
  const options: MenuOption[] = []
  const matches = [...normalize(text).matchAll(DIGIT_COMMAND)]
  // El texto normalizado conserva las posiciones del original (solo se quitan marcas
  // combinantes tras NFD, y se vuelve a medir sobre él mismo) — se trabaja sobre `norm`.
  const norm = normalize(text)
  let prevEnd = 0
  matches.forEach((m, i) => {
    const start = m.index ?? 0
    const end = start + m[0].length
    const digit = NUMBER_WORDS[m[1]] ?? m[1]

    // Etiqueta ANTES del comando: "Ventas, digite 1" / "Si desea la operadora, marque 0"
    const before = norm.slice(prevEnd, start)
    const lastSentence = before.split(/[.!?]/).pop() ?? ''
    const beforeLabel = (lastSentence.replace(/[,\s]+$/, '').split(',').pop() ?? '').trim()
    // Etiqueta DESPUÉS: "marque 0 para ser atendido por la operadora"
    const nextStart = matches[i + 1]?.index ?? norm.length
    const after = norm.slice(end, nextStart).split(/[.!?,;]/)[0].trim()
    const label = /^(para|pa)\b/.test(after) ? after : beforeLabel || after
    options.push({ digit, label })
    prevEnd = end
  })
  return options
}

// ¿Habla una grabación/menú? (para no pasarlo a Claude como si fuera conversación)
export function isAutomatedPrompt(text: string): boolean {
  const t = normalize(text)
  return IVR_CUES.some((r) => r.test(t)) || isTransferCue(t)
}

function isTransferCue(normalized: string): boolean {
  if (normalized.includes('?')) return false
  if (normalized.split(/\s+/).filter(Boolean).length > 10) return false
  // "Sí, un momento, soy yo": es el contacto contestando, no una espera
  if (/\b(soy|yo|si|claro|habla|digame|mande|bueno)\b/.test(normalized)) return false
  return TRANSFER_CUE.test(normalized)
}

// null = no parece un menú automático (sigue el camino normal con Claude).
// contact = nombre de la persona que se busca (Client.contact), para reconocerla en un directorio.
export function decideMenuAction(text: string, hint?: SwitchboardHint | null, contact?: string | null): MenuDecision | null {
  if (!isAutomatedPrompt(text)) return null
  const t = normalize(text)
  const options = parseMenuOptions(text)

  // Sin opciones: mensaje de espera, error del menú o un pedazo de menú cortado — se espera en
  // silencio (el pedazo siguiente traerá las teclas).
  if (options.length === 0) return { action: 'wait', reason: 'sin opciones: espera en línea' }

  // 1. Lo que funcionó la última vez, si esa tecla sigue en el menú
  const remembered = hint?.path?.startsWith('press:') ? hint.path.slice('press:'.length) : null
  if (remembered && hint?.outcome && hint.outcome !== 'none' && options.some((o) => o.digit === remembered)) {
    return { action: 'press', digit: remembered, reason: `memoria: la vez anterior funcionó el ${remembered}` }
  }

  // 1b. El menú nombra al contacto: es esa tecla
  const named = options.find((o) => mentionsContact(o.label, contact))
  if (named) return { action: 'press', digit: named.digit, reason: 'el menú nombra al contacto (' + named.label + ')' }

  // 2. Operadora o recepción
  const operator = options.find((o) => OPERATOR.test(o.label) && !AVOID.test(o.label)) ?? (options.find((o) => o.digit === '0') && /operadora|recepcion/.test(t) ? options.find((o) => o.digit === '0') : undefined)
  if (operator) return { action: 'press', digit: operator.digit, reason: `operadora (${operator.label || 'tecla ' + operator.digit})` }

  // 3. "Espere en la línea": suele caer en una persona y evita elegir un departamento a ciegas
  if (/espere en (la )?linea|permanezca en (la )?linea/.test(t)) {
    return { action: 'wait', reason: 'el menú ofrece esperar en línea' }
  }

  // 4. Opción que conecta con una persona de la empresa (abogado, ejecutivo…), nunca informativa ni de trámites nuevos
  const human = options.find((o) => HUMAN_CONTACT.test(o.label) && !AVOID.test(o.label) && !PERSON.test(o.label))
  if (human) return { action: 'press', digit: human.digit, reason: 'persona de la empresa (' + human.label + ')' }

  // 5. Departamento de pagos. Nunca "crédito y cobranza", ventas, compras, logística…: en una
  // empresa a la que se le cobra, esas áreas no son quien paga.
  const payables = options.find((o) => PAYABLES.test(o.label) && !/cobranza/.test(o.label))
  if (payables) return { action: 'press', digit: payables.digit, reason: `área de pagos (${payables.label})` }

  // 6. Nada reconocible: el "0" casi siempre manda a recepción (se presiona una sola vez, ver
  // el límite de repeticiones en marcar_digito)
  return { action: 'press', digit: '0', reason: 'sin operadora ni espera: se prueba el 0' }
}
