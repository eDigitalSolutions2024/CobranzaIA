// Si un cliente no contesta el número que se le marcó en outreachTimeoutMinutes,
// intenta automáticamente con el siguiente número de la lista (client.phone,
// luego cada client.alternatePhones en orden) hasta agotarlos todos.
// Se cancela apenas el cliente responde algo, en cualquier número — ver
// el borrado de outreachSentAt en messageProcessor.ts.
import cron from 'node-cron'
import Client from '../models/Client'
import { prepareWhatsappMessage } from './whatsappService'

const OUTREACH_TIMEOUT_MINUTES = 3

function allPhones(client: { phone: string; alternatePhones?: string[] }): string[] {
  return [client.phone, ...(client.alternatePhones ?? [])]
}

export async function processStalledOutreach(): Promise<void> {
  const cutoff = new Date(Date.now() - OUTREACH_TIMEOUT_MINUTES * 60 * 1000)

  const stalled = await Client.find({
    outreachSentAt: { $ne: null, $lte: cutoff },
    outreachExhausted: false,
  }).limit(50)

  for (const client of stalled) {
    try {
      const phones = allPhones(client)
      const nextIndex = (client.outreachPhoneIndex ?? 0) + 1

      if (nextIndex >= phones.length) {
        client.outreachExhausted = true
        client.outreachSentAt = null as any
        client.status = 'no_response' as any
        await client.save()
        console.log(`[PhoneFallback] ${client.name}: se agotaron los ${phones.length} número(s) sin respuesta`)
        continue
      }

      const nextPhone = phones[nextIndex]
      await prepareWhatsappMessage({
        phone: nextPhone,
        template: 'cobranza_recordatorio',
        clientName: client.name,
        debt: client.debt,
        clientId: client._id,
        channel: 'WhatsApp',
        outreachPhoneIndex: nextIndex,
      })
      console.log(`[PhoneFallback] ${client.name}: sin respuesta en el número ${nextIndex}, probando ${nextPhone}`)
    } catch (error) {
      console.error(`[PhoneFallback] Error procesando cliente ${client._id}:`, error)
    }
  }
}

export function startPhoneFallbackScheduler(): void {
  // Corre cada minuto — el margen es de solo 3 min, un ciclo de 15 min (como
  // el de recordatorios) sería demasiado impreciso.
  cron.schedule('*/1 * * * *', () => {
    processStalledOutreach().catch((error) =>
      console.error('[PhoneFallback] Error en ciclo de fallback:', error)
    )
  })
  console.log(`[PhoneFallback] Scheduler de números alternos iniciado (cada 1 min, timeout ${OUTREACH_TIMEOUT_MINUTES} min)`)
}
