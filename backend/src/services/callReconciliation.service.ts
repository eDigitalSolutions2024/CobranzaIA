// Arregla llamadas que se quedaron con status:'in_progress' para siempre porque el
// webhook de Twilio (/api/voice/status) nunca llegó — típicamente porque el backend se
// reinició justo cuando Twilio intentó avisar del resultado (confirmado en producción:
// una llamada de prueba terminó en Twilio como 'completed' con duración 0, pero nunca
// se actualizó en Mongo porque el backend estaba reiniciando en ese momento).
//
// Esto no es solo un problema visual ("se ve atorada en el dashboard") — mientras una
// llamada quede así, autoCallScheduler.service.ts SIEMPRE la va a ver como "llamada en
// curso" para ese teléfono y va a saltarse a ese cliente en cada corrida, para
// siempre — bloqueando el ciclo automático completo sin que nadie se entere.
import cron from 'node-cron'
import twilio from 'twilio'
import Call from '../models/Call'
import { processCallStatusUpdate } from '../controllers/voice.controller'

// Modo de prueba: mismo AUTO_CALL_TEST_MODE que autoCallScheduler.service.ts /
// voice.controller.ts. Con la cadencia de prueba (llamadas/mensajes cada 30s), un umbral
// de 15 min deja al cliente bloqueado toda la sesión de prueba cada vez que un webhook de
// Twilio se pierde (típicamente por un reinicio del backend a media llamada) — nunca
// llega a alcanzar el umbral dentro de una sesión corta, y el ciclo nunca avanza a los
// mensajes de WhatsApp (confirmado en pruebas reales del 2026-09-19: la llamada del
// intento 2 se quedó en 'in_progress' para siempre y bloqueó todo el ciclo).
const TEST_MODE = process.env.AUTO_CALL_TEST_MODE === 'true'

// Suficientemente largo para no interferir con una llamada genuinamente activa (la más
// larga que se ha visto en este proyecto ronda 1-2 minutos), pero no tan largo como para
// dejar al cliente bloqueado del ciclo automático por horas (o, en modo prueba, por toda
// la sesión de prueba).
const STALE_AFTER_MS = TEST_MODE ? 2 * 60 * 1000 : 15 * 60 * 1000

async function reconcileStaleCalls(): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_AFTER_MS)
  const stale = await Call.find({ status: 'in_progress', createdAt: { $lte: staleThreshold } })
    .limit(50)
    .lean()

  if (stale.length === 0) return

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

  for (const call of stale) {
    try {
      const twilioCall = await twilioClient.calls(call.callSid).fetch()
      // Twilio usa 'in-progress' (con guión) para llamadas genuinamente activas — muy
      // improbable pasados 15 minutos, pero si pasa, se deja para la siguiente corrida
      // en vez de tocarla.
      if (['queued', 'ringing', 'in-progress'].includes(twilioCall.status)) continue

      const durationSeconds = twilioCall.duration ? Number(twilioCall.duration) : null
      await processCallStatusUpdate(call.callSid, twilioCall.status, durationSeconds)
      console.log(
        `[CallReconciliation] CallSid ${call.callSid} estaba atorada en 'in_progress' — Twilio dice '${twilioCall.status}', ya se corrigió.`
      )
    } catch (err) {
      console.error(`[CallReconciliation] Error reconciliando CallSid ${call.callSid}:`, err)
    }
  }
}

export function startCallReconciliationScheduler(): void {
  // Cada 10 minutos en producción — no necesita ser más frecuente, el margen de 15 min ya
  // asume que toma un rato notar el problema. En modo prueba, cada 30s para que no
  // bloquee una sesión de prueba corta (ver STALE_AFTER_MS arriba).
  const schedule = TEST_MODE ? '*/30 * * * * *' : '*/10 * * * *'
  cron.schedule(schedule, () => {
    reconcileStaleCalls().catch((err) => console.error('[CallReconciliation] Error en ciclo:', err))
  })
  console.log(
    TEST_MODE
      ? '[CallReconciliation] Scheduler en MODO PRUEBA (cada 30s, umbral de 2 min)'
      : '[CallReconciliation] Scheduler de reconciliación de llamadas iniciado (cada 10 min)'
  )
}
