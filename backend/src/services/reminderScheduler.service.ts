import cron from 'node-cron'
import Reminder from '../models/Reminder'
import Client from '../models/Client'
import { prepareWhatsappMessage } from './whatsappService'

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
    } catch (error) {
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
