import { Request, Response } from 'express'
import Client from '../models/Client'
import { loadInvoiceSummary } from '../services/invoiceSummary.service'

// Lista de clientes en la Blacklist (candidatos detectados por la IA + confirmados por un
// administrador) — ver tarjeta "Implementar Blacklist de Clientes Morosos en el
// Dashboard". Filtros: estatus (candidate/confirmed/all), búsqueda por nombre/ID, monto
// mínimo adeudado, días mínimos de atraso.
export async function getBlacklist(req: Request, res: Response): Promise<void> {
  try {
    const statusFilter = String(req.query.status ?? 'all')
    const search = String(req.query.search ?? '').trim()
    const minDebt = req.query.minDebt ? Number(req.query.minDebt) : null
    const minDaysOverdue = req.query.minDaysOverdue ? Number(req.query.minDaysOverdue) : null

    const query: Record<string, any> = {
      blacklistStatus: statusFilter === 'all' ? { $in: ['candidate', 'confirmed'] } : statusFilter,
    }
    if (search) query.name = { $regex: search, $options: 'i' }
    if (minDebt != null && !Number.isNaN(minDebt)) query.debt = { $gte: minDebt }

    const clients = await Client.find(query).sort({ blacklistMarkedAt: -1 }).lean()

    // Días de atraso en vivo (misma fuente que el guion de voz, ver invoiceSummary.service.ts)
    // — no se usa Client.agingDays porque es una foto fija de cuando se importó el cliente.
    const withInvoices = await Promise.all(
      clients.map(async (c) => ({
        ...c,
        daysOverdue: (await loadInvoiceSummary(c._id).catch(() => null))?.oldestDaysOverdue ?? c.agingDays ?? 0,
      }))
    )

    const filtered =
      minDaysOverdue != null && !Number.isNaN(minDaysOverdue)
        ? withInvoices.filter((c) => c.daysOverdue >= minDaysOverdue)
        : withInvoices

    res.json(filtered)
  } catch (error) {
    console.error('Error getBlacklist:', error)
    res.status(500).json({ message: 'Error obteniendo la Blacklist' })
  }
}

// Administración manual: confirmar un candidato, quitarlo de la lista, agregar uno nuevo
// a mano, editar el motivo, o asignarlo a alguien de cobranza.
export async function updateBlacklistEntry(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { blacklistStatus, blacklistReason, blacklistAssignedTo } = req.body as {
      blacklistStatus?: 'none' | 'candidate' | 'confirmed'
      blacklistReason?: string | null
      blacklistAssignedTo?: string | null
    }

    if (blacklistStatus && !['none', 'candidate', 'confirmed'].includes(blacklistStatus)) {
      res.status(400).json({ message: 'blacklistStatus inválido' })
      return
    }

    const update: Record<string, any> = {}
    if (blacklistStatus) {
      update.blacklistStatus = blacklistStatus
      // Al confirmar o agregar a mano se refresca la fecha; al quitarlo de la lista se
      // deja tal cual (no borra el historial de cuándo se marcó por última vez).
      if (blacklistStatus !== 'none') update.blacklistMarkedAt = new Date()
    }
    if (blacklistReason !== undefined) update.blacklistReason = blacklistReason
    if (blacklistAssignedTo !== undefined) update.blacklistAssignedTo = blacklistAssignedTo

    const client = await Client.findByIdAndUpdate(id, update, { new: true }).lean()
    if (!client) {
      res.status(404).json({ message: 'Cliente no encontrado' })
      return
    }
    res.json(client)
  } catch (error) {
    console.error('Error updateBlacklistEntry:', error)
    res.status(500).json({ message: 'Error actualizando la Blacklist' })
  }
}
