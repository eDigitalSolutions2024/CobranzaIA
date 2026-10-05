// Gasto REAL de Anthropic (el de la consola → Costo y Uso), no el estimado a partir de los tokens
// que guardamos por llamada. Usa la API de administración de Anthropic:
//   GET /v1/organizations/cost_report                 → costo por día (en centavos, como texto)
//   GET /v1/organizations/usage_report/messages       → tokens por día y por modelo
// Requiere una clave de ADMINISTRACIÓN (sk-ant-admin…, solo para cuentas de organización; se crea
// en la consola → Configuración de la organización → Claves de administración) en
// ANTHROPIC_ADMIN_KEY. Es distinta de ANTHROPIC_API_KEY (la de las llamadas) y da acceso
// administrativo: va solo en el .env del backend, nunca en el frontend.
const BASE_URL = 'https://api.anthropic.com/v1/organizations'
const CACHE_MS = 5 * 60 * 1000
// Máximo de buckets (días) por petición según la documentación
const PAGE_LIMIT = 31

export interface AnthropicDay {
  date: string
  costUsd: number
  byModel: Record<string, number>
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface AnthropicBilling {
  days: AnthropicDay[]
  totalCostUsd: number
  totals: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  fetchedAt: string
}

export function isAnthropicBillingConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_ADMIN_KEY)
}

interface Bucket<R> {
  starting_at: string
  ending_at: string
  results: R[]
}
interface Page<R> {
  data: Bucket<R>[]
  has_more: boolean
  next_page: string | null
}

async function fetchAllBuckets<R>(path: string, params: URLSearchParams): Promise<Bucket<R>[]> {
  const out: Bucket<R>[] = []
  let page: string | null = null
  // Tope de páginas por si la API siguiera devolviendo has_more (no debería pasar con ≤ 90 días)
  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams(params)
    if (page) qs.set('page', page)
    const res = await fetch(`${BASE_URL}/${path}?${qs.toString()}`, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_ADMIN_KEY as string,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Anthropic ${path} respondió ${res.status}: ${body.slice(0, 300)}`)
    }
    const json = (await res.json()) as Page<R>
    out.push(...json.data)
    if (!json.has_more || !json.next_page) break
    page = json.next_page
  }
  return out
}

const cache = new Map<number, { at: number; value: AnthropicBilling }>()

export async function getAnthropicBilling(days: number): Promise<AnthropicBilling> {
  const hit = cache.get(days)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value

  // Los buckets se cortan por día UTC (igual que la consola): desde el inicio del día UTC de
  // hace `days - 1` días hasta mañana 00:00 UTC, para incluir hoy.
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = new Date(todayUtc - (days - 1) * 86_400_000).toISOString()
  const end = new Date(todayUtc + 86_400_000).toISOString()

  const costParams = new URLSearchParams({ starting_at: start, ending_at: end, bucket_width: '1d', limit: String(PAGE_LIMIT) })
  costParams.append('group_by[]', 'description')
  const usageParams = new URLSearchParams({ starting_at: start, ending_at: end, bucket_width: '1d', limit: String(PAGE_LIMIT) })
  usageParams.append('group_by[]', 'model')

  const [costBuckets, usageBuckets] = await Promise.all([
    fetchAllBuckets<{ amount: string; model: string | null; description: string | null }>('cost_report', costParams),
    fetchAllBuckets<{
      uncached_input_tokens: number
      output_tokens: number
      cache_read_input_tokens: number
      cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number }
    }>('usage_report/messages', usageParams),
  ])

  const byDate = new Map<string, AnthropicDay>()
  const dayOf = (iso: string) => iso.slice(0, 10)
  const ensure = (date: string): AnthropicDay => {
    let d = byDate.get(date)
    if (!d) {
      d = { date, costUsd: 0, byModel: {}, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
      byDate.set(date, d)
    }
    return d
  }

  for (const b of costBuckets) {
    const day = ensure(dayOf(b.starting_at))
    for (const r of b.results) {
      // "amount" viene en centavos como texto decimal ("123.45" = $1.23)
      const usd = Number(r.amount) / 100
      if (!Number.isFinite(usd)) continue
      day.costUsd += usd
      const model = r.model ?? 'other'
      day.byModel[model] = (day.byModel[model] ?? 0) + usd
    }
  }
  for (const b of usageBuckets) {
    const day = ensure(dayOf(b.starting_at))
    for (const r of b.results) {
      day.inputTokens += r.uncached_input_tokens ?? 0
      day.outputTokens += r.output_tokens ?? 0
      day.cacheReadTokens += r.cache_read_input_tokens ?? 0
      day.cacheWriteTokens += (r.cache_creation?.ephemeral_1h_input_tokens ?? 0) + (r.cache_creation?.ephemeral_5m_input_tokens ?? 0)
    }
  }

  const list = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const totals = list.reduce(
    (t, d) => ({
      inputTokens: t.inputTokens + d.inputTokens,
      outputTokens: t.outputTokens + d.outputTokens,
      cacheReadTokens: t.cacheReadTokens + d.cacheReadTokens,
      cacheWriteTokens: t.cacheWriteTokens + d.cacheWriteTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  )
  const value: AnthropicBilling = {
    days: list,
    totalCostUsd: list.reduce((s, d) => s + d.costUsd, 0),
    totals,
    fetchedAt: new Date().toISOString(),
  }
  cache.set(days, { at: Date.now(), value })
  return value
}
