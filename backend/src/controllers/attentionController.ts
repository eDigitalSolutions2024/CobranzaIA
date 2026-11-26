import { Request, Response } from 'express'
import Client from '../models/Client'
import { loadInvoiceSummary } from '../services/invoiceSummary.service'
import { buildClientReportFilter } from '../utils/reportFilters'

// Clientes que necesitan que una persona haga algo — pestañas junto a la Blacklist en el Dashboard.
const QUEUE_FILTERS = {
  // Seguimiento abierto (segundo intento pendiente) o última llamada en Follow up sin escalar
  follow_up: {
    $or: [{ followUp: { $ne: null } }, { lastCallDisposition: 'Follow up', collectorAssignedAt: null }],
  },
  needs_agent: { requiresHuman: true },
  needs_admin: { needsAdmin: true },
  // Asignados a Collector Assistance; la segunda condición incluye los anteriores al campo collectorAssignedAt
  collector: {
    $or: [{ collectorAssignedAt: { $ne: null } }, { lastCallDisposition: 'Prefers CAS support', nextAction: 'Collector review' }],
  },
} as const

type Queue = keyof typeof QUEUE_FILTERS | 'all'

const QUEUE_KEYS = Object.keys(QUEUE_FILTERS) as (keyof typeof QUEUE_FILTERS)[]

// Filas por página. Los días de atraso se calculan por cliente (una consulta cada uno), así que solo se calculan
// los de la página pedida (salvo al filtrar por días de atraso, que necesita revisarlos todos)
const PAGE_SIZE = 10

function queueFilter(queue: Queue): Record<string, any> {
  return queue === 'all' ? { $or: QUEUE_KEYS.map((k) => QUEUE_FILTERS[k]) } : QUEUE_FILTERS[queue]
}

// A qué colas pertenece un cliente (para las etiquetas de la tabla) — mismas reglas que QUEUE_FILTERS
function queuesOf(c: any): string[] {
  const queues: string[] = []
  if (c.followUp || (c.lastCallDisposition === 'Follow up' && !c.collectorAssignedAt)) queues.push('follow_up')
  if (c.requiresHuman) queues.push('needs_agent')
  if (c.needsAdmin) queues.push('needs_admin')
  if (c.collectorAssignedAt || (c.lastCallDisposition === 'Prefers CAS support' && c.nextAction === 'Collector review')) queues.push('collector')
  return queues
}

export async function getAttentionQueue(req: Request, res: Response): Promise<void> {
  try {
    const requested = String(req.query.queue ?? 'all')
    const queue: Queue = (QUEUE_KEYS as string[]).includes(requested) ? (requested as Queue) : 'all'
    const search = String(req.query.search ?? '').trim()
    const minDaysOverdue = req.query.minDaysOverdue ? Number(req.query.minDaysOverdue) : null
    const byName = search ? { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}

    const byDays = minDaysOverdue != null && !Number.isNaN(minDaysOverdue)
    const requestedPage = Math.max(1, Math.floor(Number(req.query.page)) || 1)
    // Los 5 filtros del Dashboard aplican a la tabla y a los contadores de las pestañas
    const report = buildClientReportFilter(req.query)
    const filter = { ...report, ...byName, ...queueFilter(queue) }

    const allQueues: Queue[] = [...QUEUE_KEYS, 'all']
    const [matching, totals, blacklist] = await Promise.all([
      Client.countDocuments(filter),
      Promise.all(allQueues.map((q) => Client.countDocuments({ ...report, ...queueFilter(q) }))),
      Client.countDocuments({ ...report, blacklistStatus: { $in: ['candidate', 'confirmed'] } }),
    ])

    const withDays = (clients: any[]) =>
      Promise.all(
        clients.map(async (c) => ({
          ...c,
          queues: queuesOf(c),
          daysOverdue: (await loadInvoiceSummary(c._id).catch(() => null))?.oldestDaysOverdue ?? c.agingDays ?? 0,
        }))
      )

    // Los más recientes primero (última llamada). Una página que ya no existe (ej. se atendieron clientes) cae en
    // la última.
    const find = () => Client.find(filter).sort({ lastCallAt: -1, _id: 1 })
    const filteredByDays = byDays ? (await withDays(await find().lean())).filter((c) => c.daysOverdue >= minDaysOverdue!) : null
    const total = filteredByDays ? filteredByDays.length : matching
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(requestedPage, pages)
    const skip = (page - 1) * PAGE_SIZE
    const entries = filteredByDays
      ? filteredByDays.slice(skip, skip + PAGE_SIZE)
      : await withDays(await find().skip(skip).limit(PAGE_SIZE).lean())

    res.json({
      entries,
      total,
      page,
      pageSize: PAGE_SIZE,
      counts: { ...Object.fromEntries(allQueues.map((q, i) => [q, totals[i]])), blacklist },
    })
  } catch (error) {
    console.error('Error getAttentionQueue:', error)
    res.status(500).json({ message: 'Error obteniendo los clientes pendientes' })
  }
}
