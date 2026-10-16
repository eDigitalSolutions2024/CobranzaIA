// Lectura estricta de los campos de contacto que trae el Excel de HP ("Open AutoCall"):
// teléfono, nombre del contacto y extensión. Las celdas vienen escritas a mano y con ruido
// ("6688187777,0", "52 55 5208 4649", "Araceli  Chavez CONT.NVO David d", "Ext. 138"). Un valor
// que no se puede leer con seguridad se devuelve vacío y se reporta, en vez de adivinarlo: un
// teléfono mal armado puede terminar marcando otro país.

const digitsOf = (s: string): string => s.replace(/\D/g, '')

// 10 dígitos válidos de México (la lada no empieza con 0 ni 1) a partir de un fragmento, quitando
// prefijos comunes: 01 / 044 / 045 (larga distancia y celular antiguos), 52 / 521 (código de país)
// y el 1 inicial de 11 dígitos.
function tenDigits(fragment: string): string {
  let d = digitsOf(fragment)
  if (d.length === 13 && (d.startsWith('044') || d.startsWith('045') || d.startsWith('521'))) d = d.slice(3)
  else if (d.length === 12 && (d.startsWith('01') || d.startsWith('52'))) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  else if (d.length === 12 && d.startsWith('044')) d = d.slice(3)
  return /^[2-9]\d{9}$/.test(d) ? d : ''
}

export interface ParsedPhone {
  phone: string // "+52XXXXXXXXXX", o '' si no se pudo leer con seguridad
  reason?: string // por qué quedó vacío (para el reporte de la importación)
}

// Acepta el valor de la celda tal cual. Si trae varios números ("A,B", "A / B", "A Y B") toma el
// primero válido. Sin lada (8 dígitos) no se puede saber a qué ciudad pertenece: se reporta.
export function parseMexicanPhone(raw: unknown): ParsedPhone {
  const s = String(raw ?? '').trim()
  if (!s) return { phone: '', reason: 'vacío' }
  const parts = s.split(/[,;/|&\n]|\s+y\s+/i)
  for (const part of parts) {
    const ten = tenDigits(part)
    if (ten) return { phone: `+52${ten}` }
  }
  const whole = tenDigits(s)
  if (whole) return { phone: `+52${whole}` }
  const len = digitsOf(s).length
  return { phone: '', reason: len < 10 ? `solo ${len} dígitos (falta la lada)` : `formato no reconocido (${len} dígitos)` }
}

const TITLES = /^((c\.?\s?p\.?|l\.?\s?c\.?|lic|licda|ing|dr|dra|arq|mtro|mtra|sr|sra|srita|contador|contadora)\.?\s+)+/i
const NON_PERSON = /^(portal|pagos?|cuentas|proveedores?|tesorer|contabilidad|administraci|facturaci|cobranza|recepci|compras|ventas|gerencia)\b|^(n\/?a|sin contacto|no aplica|ninguno)$/i

// Nombre de una PERSONA para el saludo del agente, a partir de la celda "Contact". Quita correos,
// títulos (C.P., Lic., Ing.), notas ("CONT.NVO …", "al siguiente …") y se queda con el primer
// nombre si hay varios ("Ana Ruiz / Luis Soto"). Devuelve null si no es una persona (un portal,
// un buzón de correo o un área): en ese caso el agente pide a "la persona encargada de pagos".
export function cleanContactName(raw: unknown): string | null {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  s = s.replace(/\S*@\S*/g, ' ') // correos (completos o cortados)
  s = s.split(/\s*[/;|]\s*|\s*,\s*|\s+y\s+|\s+-\s+/i)[0] // solo el primero si hay varios
  s = s.replace(/\(.*?\)/g, ' ')
  s = s.replace(/\b(cont\.?\s*nvo|contacto nuevo|nuevo contacto|ext\.?|extensi[oó]n)\b.*$/i, ' ')
  s = s.replace(/\s+(al siguiente|favor de|cambi[oó]|tel[eé]fono|tel\.)\b.*$/i, ' ')
  s = s.replace(/\d+/g, ' ')
  s = s.replace(TITLES, '')
  s = s.replace(/[^\p{L}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/\.+$/, '').trim() // punto final suelto ("Martín Martínez Olvera.")
  if (s.length < 3 || NON_PERSON.test(s) || s.split(' ').length > 7) return null
  // Usuario de correo ("claudia.montes") escrito en vez de un nombre
  if (/^[a-z0-9]+\.[a-z0-9.]+$/.test(s)) return null
  // El nombre del propio agente ("soy Guadalupe Martínez… ¿hablo con Guadalupe Martínez?")
  if (s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === 'guadalupe martinez') return null
  // Todo en mayúsculas ("ALICIA CABRERA") o todo en minúsculas ("karina fabiol fernandez") → "Alicia Cabrera"
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase())
  return s
}

// Extensión que trae la celda "Ext" ("Ext 178", "ext.3055", "Ext: 307", "Ext 19, 20", "115"):
// el primer grupo de dígitos. Si trae varias, queda la primera.
export function parseExtension(raw: unknown): string | null {
  const m = String(raw ?? '').match(/\d{1,6}/)
  return m ? m[0] : null
}
