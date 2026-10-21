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

// immediate = se puede actuar con lo que ya se oyó. Las decisiones que dependen de ver TODAS las
// opciones del menú (área de pagos, "probar el 0") llevan immediate:false: el controlador espera a
// que la grabación termine de hablar y decide con el menú completo. Una operadora, la memoria o
// el nombre del contacto no cambian por lo que venga después, así que esas se actúan al instante.
export type MenuDecision =
  | { action: 'press'; digit: string; reason: string; immediate: boolean }
  | { action: 'wait'; reason: string; immediate: boolean }
  // Grabación de "ya cerramos / fuera de horario": no hay nadie a quien esperar, se cuelga
  | { action: 'hangup'; reason: string; immediate: true }

// Lo que funcionó la última vez con este número (ver Client.switchboard)
export interface SwitchboardHint {
  kind?: string | null
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

// Incluye el trato de "tú" ("Presiona 1", "Marca 0"), muy común en los menús de México
const DIGIT_COMMAND = /\b(?:marque|marca|digite|digita|oprima|oprime|presione|presiona|pulse|pulsa|teclee|teclea|ingrese|ingresa)\s+(?:el\s+|la\s+tecla\s+)?(?:numero\s+)?(\d|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|asterisco|numeral|gato)\b/g

// Menús que solo enumeran "1, Ciudad de México. 2, Guadalajara." (el verbo "seleccione…" va en otro pedazo)
const ENUMERATED_OPTION = /(?:^|[.!?]\s+)([0-9])\s*,\s*([a-z][^.!?,]{2,60}?)(?=[.!?]|$)/g

// Pistas de que habla una grabación y no una persona
const IVR_CUES: RegExp[] = [
  /si conoce (el numero de |la )?extension/,
  /espere en (la )?linea/,
  /permanezca en (la )?linea|permanezca a la espera|mientras se transfiere su llamada|espere mientras se transfiere/,
  /(su llamada|esta llamada) (puede ser|podra ser|sera|esta siendo|podria ser) (grabada|monitoreada)/,
  /para fines de calidad/,
  // Cola de espera: "todas nuestras atenciones están ocupadas, favor de esperar" → se espera, no se cuelga
  /todas nuestras (atenciones|lineas|operadoras)[^.]{0,30}ocupad|favor de esperar/,
  /seleccione (cualquiera|una) de las (siguientes )?opciones|elija una (de las )?opcion/,
  /para efectos de calidad/,
  /vuelva a intentarlo|no lo entiendo|opcion (no )?valida|marcacion invalida|informacion no fue recibida|excedido el numero de intentos/,
  /for english|press (one|two|\d)/,
  /\b(?:marque|marca|digite|digita|oprima|oprime|presione|presiona|pulse|pulsa|teclee|teclea)\b[^.?]*(?:\d|asterisco|numeral|extension|operadora)/,
  // Texto institucional de una grabación (no lo dice una recepcionista al contestar)
  /aviso de privacidad/,
  /triple doble u|\bwww\b|punto com\b|nuestra pagina|visita nuestra|visite nuestra/,
  /siganos en|facebook|instagram/,
  /su llamada es (muy )?importante/,
  /horario de atencion/,
  /agradecemos su llamada|gracias por su preferencia/,
  /(enseguida|en un momento|en breve|a la brevedad) (lo|le|la|sera|seran) (atend|comunic|transfer)/,
  /(esta|estas) llamando a|ha llamado a|ha marcado a/,
]

// Grabaciones sin salida: oficina cerrada, línea ocupada, buzón lleno. Esperar o hablarles no sirve de nada,
// hay que colgar (el ciclo reintenta). Se redactan como lo dice una GRABACIÓN ("el destinatario … está ocupado"):
// una recepcionista también dice "se encuentra ocupado" de la persona, y eso NO debe colgar.
const CLOSED_CUE = new RegExp(
  [
    'ya (hemos )?cerrado',
    '(estamos|permanecemos|se encuentra[n]?) cerrad[oa]s?',
    'oficinas? (esta[n]? )?cerrad[oa]s?',
    'fuera de(l)? horario',
    'nuestro horario (de atencion )?ha (terminado|concluido)',
    'no hay (personal|nadie) disponible',
    // línea ocupada / sin respuesta, dicho por la central
    'el (numero|destinatario|usuario|abonado)[^.]{0,70}ocupad',
    'numero que marco[^.]{0,40}(ocupad|no (esta|existe))',
    'intente (mas )?tarde',
    // buzón que no se puede usar
    'memory is full|mailbox is full|remote access code|buzon (esta )?lleno',
  ].join('|')
)

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
  // Opciones enumeradas sin verbo ("1, Ciudad de México. 2, Guadalajara."): se agregan las teclas que
  // no salieron ya con un "marque/presiona"
  for (const m of norm.matchAll(ENUMERATED_OPTION)) {
    if (!options.some((o) => o.digit === m[1])) options.push({ digit: m[1], label: m[2].trim() })
  }
  return options
}

// Dos o más opciones numeradas seguidas ("1, ventas. 2, compras.") = un menú, aunque no diga "marque"
function looksLikeEnumeratedMenu(normalized: string): boolean {
  return [...normalized.matchAll(ENUMERATED_OPTION)].length >= 2
}

// ¿Habla una grabación/menú? (para no pasarlo a Claude como si fuera conversación)
export function isAutomatedPrompt(text: string): boolean {
  const t = normalize(text)
  return IVR_CUES.some((r) => r.test(t)) || CLOSED_CUE.test(t) || looksLikeEnumeratedMenu(t) || isTransferCue(t) || isLongRecordedGreeting(t)
}

// "Gracias por llamar a X…" / "Bienvenido a X…" largo y sin preguntas: una grabación. Una recepcionista
// dice lo mismo pero corto y casi siempre cierra con una pregunta ("¿en qué le puedo ayudar?").
function isLongRecordedGreeting(normalized: string): boolean {
  if (normalized.includes('?')) return false
  const words = normalized.split(/\s+/).filter(Boolean).length
  return words > 12 && /^(hola,? )?(gracias por (llamar|comunicarse|comunicarte)|bienvenid[oa]s?)/.test(normalized)
}

function isTransferCue(normalized: string): boolean {
  if (normalized.includes('?')) return false
  if (normalized.split(/\s+/).filter(Boolean).length > 10) return false
  // "Sí, un momento, soy yo": es el contacto contestando, no una espera
  if (/\b(soy|yo|si|claro|habla|digame|mande|bueno)\b/.test(normalized)) return false
  return TRANSFER_CUE.test(normalized)
}

// Saludo corto de una persona al contestar ("¿bueno?", "buenas tardes", "diga"). Sirve para no
// confundirlo con la continuación de un menú que sigue hablando.
export function isShortHumanGreeting(text: string): boolean {
  const t = normalize(text).replace(/[¿?¡!.,]/g, ' ').trim()
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 4) return false
  return /^(bueno|alo|diga|digame|mande|hola|si|buen(os|as|a)|dias|tardes|noches)/.test(words[0])
}

// ¿Contestó como una recepción? ("Grupo Hércules, buen día", "Altura, buenas tardes", "Está hablando a
// Laboratorios Castells"). Quien dice el nombre de la empresa espera que le PIDAN comunicarse con alguien;
// preguntarle "¿hablo con X?" no encaja. Un "¿bueno?" o "buenos días" suelto se trata como persona directa.
export function answeredLikeReception(text: string): boolean {
  if (isShortHumanGreeting(text)) return false
  const t = normalize(text)
  const words = t.replace(/[¿?¡!.,]/g, ' ').split(/\s+/).filter(Boolean)
  return words.length >= 2 || /\b(grupo|colegio|hospital|clinica|laboratorios?|universidad|despacho|notaria|automotriz|recepcion|corporativo)\b/.test(t)
}

// null = no parece un menú automático (sigue el camino normal con Claude).
// contact = nombre de la persona que se busca (Client.contact), para reconocerla en un directorio.
// pressedTwice = teclas que ya se presionaron 2 veces sin que el menú avanzara: no se vuelven a elegir (se
// prueba la siguiente mejor opción, o se espera). Una sola vez sí se repite: "su respuesta no fue recibida"
// suele ser que no se oyó el tono.
export function decideMenuAction(text: string, hint?: SwitchboardHint | null, contact?: string | null, pressedTwice: string[] = []): MenuDecision | null {
  if (!isAutomatedPrompt(text)) return null
  const t = normalize(text)

  // "Ya hemos cerrado" / "fuera de horario": no hay nadie, se cuelga (y el ciclo reintenta). Antes el
  // agente le contestaba conversación a esa grabación y llegó a "programar una llamada" por error.
  // Solo si la grabación no ofrece ninguna tecla: "no hay nadie disponible… pulse 0 para la operadora" tiene salida.
  const allOptions = parseMenuOptions(text)
  if (CLOSED_CUE.test(t) && allOptions.length === 0) return { action: 'hangup', reason: 'grabación sin salida (cerrado/ocupado/buzón lleno)', immediate: true }

  const options = allOptions.filter((o) => !pressedTwice.includes(o.digit))
  // El menú tiene teclas pero ya se probaron las útiles: no insistir, esperar en línea
  if (allOptions.length > 0 && options.length === 0) {
    return { action: 'wait', reason: 'ya se probaron las teclas del menú sin avanzar', immediate: true }
  }

  // Sin opciones: mensaje de espera, error del menú o un pedazo de menú cortado. Se espera en silencio
  // pero NO se da por final: el pedazo siguiente puede traer las teclas (el controlador junta lo que
  // la grabación va diciendo y decide cuando termina de hablar).
  if (options.length === 0) return { action: 'wait', reason: 'sin opciones: espera en línea', immediate: false }

  // 1. Lo que funcionó la última vez, si esa tecla sigue en el menú
  const remembered = hint?.path?.startsWith('press:') ? hint.path.slice('press:'.length) : null
  if (remembered && hint?.outcome && hint.outcome !== 'none' && options.some((o) => o.digit === remembered)) {
    return { action: 'press', digit: remembered, reason: `memoria: la vez anterior funcionó el ${remembered}`, immediate: true }
  }

  // 1a. La vez anterior bastó con esperar en línea (sin presionar nada): se espera ya, sin oír el menú completo
  if (hint?.path === 'wait' && hint.outcome && hint.outcome !== 'none') {
    return { action: 'wait', reason: 'memoria: la vez anterior bastó con esperar en línea', immediate: true }
  }

  // 1b. El menú nombra al contacto: es esa tecla
  const named = options.find((o) => mentionsContact(o.label, contact))
  if (named) return { action: 'press', digit: named.digit, reason: 'el menú nombra al contacto (' + named.label + ')', immediate: true }

  // 2. Operadora o recepción
  const operator = options.find((o) => OPERATOR.test(o.label) && !AVOID.test(o.label)) ?? (options.find((o) => o.digit === '0') && /operadora|recepcion/.test(t) ? options.find((o) => o.digit === '0') : undefined)
  if (operator) return { action: 'press', digit: operator.digit, reason: `operadora (${operator.label || 'tecla ' + operator.digit})`, immediate: true }

  // 3. "Espere en la línea": suele caer en una persona y evita elegir un departamento a ciegas.
  // Se dice al final del menú, así que ya se oyeron todas las opciones.
  if (/espere en (la )?linea|permanezca en (la )?linea/.test(t)) {
    return { action: 'wait', reason: 'el menú ofrece esperar en línea', immediate: true }
  }

  // 4. Opción que conecta con una persona de la empresa (abogado, ejecutivo…), nunca informativa ni de trámites nuevos
  const human = options.find((o) => HUMAN_CONTACT.test(o.label) && !AVOID.test(o.label) && !PERSON.test(o.label))
  if (human) return { action: 'press', digit: human.digit, reason: 'persona de la empresa (' + human.label + ')', immediate: false }

  // 5. Departamento de pagos. Nunca "crédito y cobranza", ventas, compras, logística…: en una
  // empresa a la que se le cobra, esas áreas no son quien paga.
  const payables = options.find((o) => PAYABLES.test(o.label) && !/cobranza/.test(o.label))
  if (payables) return { action: 'press', digit: payables.digit, reason: `área de pagos (${payables.label})`, immediate: false }

  // 6. Nada reconocible: el "0" casi siempre manda a recepción (se presiona una sola vez, ver
  // el límite de repeticiones en marcar_digito)
  if (pressedTwice.includes('0')) return { action: 'wait', reason: 'el 0 ya se probó dos veces', immediate: true }
  return { action: 'press', digit: '0', reason: 'sin operadora ni espera: se prueba el 0', immediate: false }
}
