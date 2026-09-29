// Convierte cifras escritas con dígitos a palabras en español de México, para que la voz
// del agente las lea como una persona. Solo se usa antes de mandar texto a ElevenLabs
// (ver sendText en elevenLabsTts.service.ts): el modelo eleven_flash_v2_5 es pequeño y
// no sabe leer cifras complejas — su propia documentación da el ejemplo de "$1,000,000"
// leído como "mil mil dólares" — y en llamadas reales un monto como "1,685,641.34 pesos"
// salía como ruido o sílabas en otro idioma a media frase. La transcripción de la
// llamada NO pasa por aquí: conserva los dígitos originales.

const UNITS = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Sustantivos femeninos que aparecen en el guion: "una factura", "veintiuna facturas".
const FEMININE_NOUNS = /^(factura|facturas|hora|horas|semana|semanas|cuota|cuotas|llamada|llamadas|vez|veces)$/i

// Cómo se dice el "uno" final de una cifra: "uno" suelto ("son veintiuno"), "un" antes
// de un sustantivo masculino o de mil/millones ("veintiún pesos", "un millón"), "una"
// antes de un sustantivo femenino ("veintiuna facturas").
type OneForm = 'uno' | 'un' | 'una'

function applyOneForm(words: string, form: OneForm): string {
  if (form === 'uno') return words
  if (form === 'una') return words.replace(/veintiuno$/, 'veintiuna').replace(/\buno$/, 'una')
  return words.replace(/veintiuno$/, 'veintiún').replace(/\buno$/, 'un')
}

function below1000(n: number, form: OneForm): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const h = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (h) parts.push(HUNDREDS[h])
  if (rest) {
    let restWords: string
    if (rest < 30) restWords = UNITS[rest]
    else {
      const t = Math.floor(rest / 10)
      const u = rest % 10
      restWords = u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t]
    }
    parts.push(applyOneForm(restWords, form))
  }
  return parts.join(' ')
}

// Entero a palabras, hasta cientos de miles de millones (sobra para montos de cobranza).
export function integerToSpanish(n: number, form: OneForm = 'uno'): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return String(n)
  if (n === 0) return 'cero'
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (millions) {
    // "un millón", "veintiún millones", "mil millones"
    parts.push(millions === 1 ? 'un millón' : `${integerToSpanish(millions, 'un')} millones`)
  }
  if (thousands) {
    // "mil", no "un mil"; "veintiún mil", "ciento un mil"
    parts.push(thousands === 1 ? 'mil' : `${below1000(thousands, 'un')} mil`)
  }
  if (rest) parts.push(below1000(rest, form))
  return parts.join(' ')
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''))
}

// Palabras que no son sustantivos: antes de ellas el número va completo ("son 21 de
// ellos" → "veintiuno de ellos", no "veintiún de ellos").
const NON_NOUNS = /^(de|del|y|o|a|al|en|por|para|con|que|es|son|mas|más)$/i

function oneFormForNextWord(nextWord: string | undefined): OneForm {
  if (!nextWord || NON_NOUNS.test(nextWord)) return 'uno'
  if (FEMININE_NOUNS.test(nextWord)) return 'una'
  return /^[a-záéíóúñ]/i.test(nextWord) ? 'un' : 'uno'
}

// "1,685,641.34" → "un millón seiscientos ochenta y cinco mil seiscientos cuarenta y un pesos con treinta y cuatro centavos"
function moneyToSpanish(raw: string): string {
  const [intPart, decPart] = raw.replace(/,/g, '').split('.')
  const pesos = Number(intPart)
  const centavos = decPart ? Number(decPart.padEnd(2, '0').slice(0, 2)) : 0
  const exactMillions = pesos >= 1_000_000 && pesos % 1_000_000 === 0
  let out =
    pesos === 1
      ? 'un peso'
      : `${integerToSpanish(pesos, 'un')}${exactMillions ? ' de' : ''} pesos`
  if (centavos) out += ` con ${centavos === 1 ? 'un centavo' : `${integerToSpanish(centavos, 'un')} centavos`}`
  return out
}

function decimalToSpanish(raw: string): string {
  const [intPart, decPart] = raw.replace(/,/g, '').split('.')
  const intWords = integerToSpanish(Number(intPart))
  if (!decPart) return intWords
  // "2.5" → "dos punto cinco"; ceros a la izquierda se leen ("1.05" → "uno punto cero cinco")
  const leadingZeros = decPart.match(/^0*/)?.[0].length ?? 0
  const decWords = [...Array(leadingZeros).fill('cero'), ...(Number(decPart) ? [integerToSpanish(Number(decPart))] : [])]
  return `${intWords} punto ${decWords.join(' ')}`
}

function digitsOneByOne(digits: string): string {
  return digits.split('').map((d) => UNITS[Number(d)]).join(' ')
}

function dateToSpanish(day: number, month: number, year?: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dayWords = day === 1 ? 'primero' : integerToSpanish(day)
  return `${dayWords} de ${MONTHS[month - 1]}${year ? ` de ${integerToSpanish(year)}` : ''}`
}

// Número con separador de miles y/o decimales: 1,685,641.34 · 10,272 · 2.5 · 90
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`

export function spellOutNumbers(text: string): string {
  if (!/\d/.test(text)) return text
  let out = text

  // Fechas ISO (2026-10-15) y dd/mm/aaaa (15/10/2026)
  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => dateToSpanish(+d, +mo, +y) ?? m)
  out = out.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (m, d, mo, y) => dateToSpanish(+d, +mo, +y) ?? m)

  // Día con mes escrito: "el 1 de octubre" → "el primero de octubre", "15 de octubre" → "quince de octubre"
  out = out.replace(
    new RegExp(String.raw`\b(\d{1,2})\s+de\s+(${MONTHS.join('|')})\b`, 'gi'),
    (m, d, month) => {
      const day = Number(d)
      if (day < 1 || day > 31) return m
      return `${day === 1 ? 'primero' : integerToSpanish(day)} de ${month}`
    }
  )

  // Horas: "10:30" → "diez treinta", "10:00" → "diez", "1:15" → "una y quince"
  out = out.replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mi) => {
    const hour = Number(h)
    const minute = Number(mi)
    if (hour > 23 || minute > 59) return m
    const hourWords = integerToSpanish(hour, 'una')
    return minute ? `${hourWords} ${minute < 10 ? `y ${UNITS[minute]}` : integerToSpanish(minute)}` : hourWords
  })

  // Extensiones se dicen dígito por dígito: "extensión 1001" → "extensión uno cero cero uno"
  out = out.replace(/\b(extensi[oó]n|ext\.?)\s+(\d+)\b/gi, (_m, label, digits) => `${label} ${digitsOneByOne(digits)}`)

  // Porcentajes: "65%" → "sesenta y cinco por ciento"
  out = out.replace(new RegExp(String.raw`(${NUM})\s?%`, 'g'), (_m, n) => `${decimalToSpanish(n)} por ciento`)

  // Dinero: "$1,685,641.34 pesos", "$1,685,641.34", "1,685,641.34 pesos", "10,272.24 MXN"
  out = out.replace(
    new RegExp(String.raw`\$\s?(${NUM})(\s*(?:pesos|MXN|M\.N\.)(?![a-záéíóúñ]))?|(${NUM})\s*(?:pesos|MXN|M\.N\.)(?![a-záéíóúñ])`, 'gi'),
    (_m, withSign, _suffix, withoutSign) => moneyToSpanish(withSign ?? withoutSign)
  )
  // Cifra con separador de miles y centavos sin "$" ni "pesos" ("…de 10,272.24, ¿lo
  // reconoce?") — en una llamada de cobranza siempre es un monto.
  out = out.replace(/(?<![\d.,])(\d{1,3}(?:,\d{3})+\.\d{2})(?![\d])/g, (_m, n) => moneyToSpanish(n))

  // Secuencias largas de dígitos sin separadores (teléfonos, extensiones, folios) se
  // leen dígito por dígito, como las diría una persona: "6568206988" → "seis cinco seis ..."
  out = out.replace(/\b\d{5,}\b/g, (d) => digitsOneByOne(d))

  // Cualquier otro número: con decimales → "punto"; entero → según el sustantivo que sigue
  // ("19 facturas" → "diecinueve facturas", "21 días" → "veintiún días", "1 factura" → "una factura")
  // Números pegados a letras ("3m Peru", "F1001") se dejan como están — no son cantidades.
  out = out.replace(new RegExp(String.raw`(?<![a-záéíóúñ\d])(${NUM})(?![a-záéíóúñ\d])(\s+([a-záéíóúñ]+))?`, 'gi'), (_m, n, space, nextWord) => {
    const words = n.includes('.') ? decimalToSpanish(n) : integerToSpanish(parseAmount(n), oneFormForNextWord(nextWord))
    return `${words}${space ?? ''}`
  })

  return out
}
