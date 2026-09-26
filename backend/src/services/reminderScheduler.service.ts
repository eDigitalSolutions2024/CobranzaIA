import cron from 'node-cron'
import Reminder from '../models/Reminder'
import Client from '../models/Client'
import { prepareWhatsappMessage } from './whatsappService'

// Errores que prepareWhatsappMessage lanza a propósito por horario hábil / tope diario
// (ver whatsappService.ts) — NO son una falla real, se debe reintentar en la siguiente
// corrida en vez de marcar el recordatorio como 'failed' para siempre.
const POSTPONED_ERRORS = new Set(['OUTSIDE_BUSINESS_HOURS', 'DAILY_MESSAGE_CAP_REACHED'])

async function dispatchDueReminders(): Promise<void> {
  const due = await Reminder.find({ status: 'pending', remindAt: { $lte: new Date() } }).limit(50)

  for (const reminder of due) {
    try {
      const client = await Client.findById(reminder.clientId).lean()
      if (!client) {
        reminder.status = 'failed'
        await reminder.save()
        continue
      }

      // Pago reportado/en proceso/domiciliado detectado desde que se agendó este
      // recordatorio — ver tarjeta "Exclusión automática de clientes del ciclo mensual
      // de cobranza". Se deja 'pending' (no 'failed') — si la exclusión termina antes de
      // que se agote la promesa, el recordatorio sigue teniendo sentido y se manda solo.
      const excludedUntil = client.collectionExcludedUntil as Date | null
      if (excludedUntil && excludedUntil > new Date()) {
        console.log(`[Reminders] Recordatorio ${reminder._id} pospuesto — ${client.name} excluido del ciclo (${client.collectionExclusionReason}).`)
        continue
      }

      await prepareWhatsappMessage({
        phone: client.phone,
        template: 'cobranza_recordatorio',
        clientName: client.name,
        debt: client.debt,
        clientId: client._id,
        channel: 'reminder',
      })

      reminder.status = 'sent'
      await reminder.save()
      console.log(`[Reminders] Recordatorio enviado a ${client.phone} (reminder ${reminder._id})`)
    } catch (error: any) {
      if (POSTPONED_ERRORS.has(error?.message)) {
        console.log(`[Reminders] Recordatorio ${reminder._id} pospuesto (${error.message}) — se reintenta en la siguiente corrida.`)
        continue // se deja status:'pending', remindAt ya venció así que sigue elegible
      }
      console.error(`[Reminders] Error enviando recordatorio ${reminder._id}:`, error)
      reminder.status = 'failed'
      await reminder.save()
    }
  }
}

export function startReminderScheduler(): void {
  // Corre cada 15 minutos buscando recordatorios vencidos (remindAt <= ahora, status pending)
  cron.schedule('*/15 * * * *', () => {
    dispatchDueReminders().catch((error) =>
      console.error('[Reminders] Error en ciclo de recordatorios:', error)
    )
  })
  console.log('[Reminders] Scheduler de recordatorios iniciado (cada 15 min)')
}
