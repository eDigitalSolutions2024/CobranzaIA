// Dispara el ciclo automático de cobranza completo pedido por el usuario:
// 1er intento llamada -> sin respuesta -> 2do intento llamada -> sin respuesta ->
// 3er intento mensaje WhatsApp -> (sin necesidad de respuesta para avanzar) ->
// 4to intento WhatsApp final. Los 4 pasos son automáticos — no hay paso manual en
// este flujo (el usuario corrigió esto explícitamente: al principio el paso 3/4 iba a
// quedar manual, pero pidió automatizarlo también usando las plantillas de WhatsApp que
// ya existen, aunque cambien más adelante).
//
// Corre en lotes (AUTO_CALL_BATCH_SIZE, default 12) cada hora en punto, solo en
// horario laboral (lun-sáb 9am-7pm hora CDMX) — con potencialmente cientos de clientes,
// disparar todo de golpe saturaría la cuenta de Twilio/OpenAI (llamadas) y el rate limit
// de Meta (mensajes). Procesando en lotes varias veces al día, la cola se va vaciando
// sola sin necesitar infraestructura de colas aparte.
import cron from 'node-cron'
import Client from '../models/Client'
import Call from '../models/Call'
import AutomationSettings from '../models/AutomationSettings'
import { placeOutboundCall } from '../controllers/voice.controller'
import { prepareWhatsappMessage } from './whatsappService'

const BATCH_SIZE = Number(process.env.AUTO_CALL_BATCH_SIZE) || 12

// Modo de prueba: con AUTO_CALL_TEST_MODE=true, TODOS los tiempos del ciclo (gaps entre
// pasos, duración del ciclo semanal, y qué tan seguido corre el cron) se acortan a
// minutos — para poder ver el flujo completo de 4 pasos en una sola sesión de prueba en
// vez de esperar una semana real. Se declara aquí y también en voice.controller.ts
// (AUTO_CALL_RETRY_GAP_MS/AUTO_MESSAGE_GAP_MS) — mismo env var, mismo efecto en los dos
// archivos que manejan el timing del ciclo.
const TEST_MODE = process.env.AUTO_CALL_TEST_MODE === 'true'

// Modo "test con timing real": restringe los candidatos al test group (igual que
// TEST_MODE) pero SIN acelerar nada — mismo cron por hora, mismo horario laboral, mismo
// ciclo de 7 días y mismos gaps que producción (AUTO_CALL_RETRY_GAP_MS/AUTO_MESSAGE_GAP_MS
// en voice.controller.ts, que solo se aceleran con AUTO_CALL_TEST_MODE, no con esta
// variable). Pensado para validar el comportamiento real del ciclo completo sobre el test
// group antes de soltarlo a todos los clientes, sin esperar ni arriesgar la base real.
// TEST_MODE sigue implicando esta restricción también (no se quita nada de lo que ya
// funcionaba), solo se agrega una forma de tener SOLO la restricción sin la aceleración.
const TEST_GROUP_ONLY = process.env.AUTO_CALL_TEST_GROUP_ONLY === 'true' || TEST_MODE

// 30 min (no 5) en modo prueba: con gaps de 30s entre pasos, un ciclo completo de 4
// pasos "debería" tardar ~1.5 min, pero cada llamada real suma timbrado + conversación +
// latencia del webhook de Twilio — con 5 min el reloj del ciclo se cumplía A MEDIAS
// (ej. justo después del intento 2, antes del paso 3 de WhatsApp), y como
// autoCallCycleStartAt seguía viéndose "viejo" (isNewCycle) el intento se reiniciaba a
// 1/4 en vez de avanzar a 3/4 — nunca llegaba a mandar mensajes (ver bug de 2026-09-19).
const CYCLE_MS = TEST_MODE ? 30 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
// Gap entre el 3er y 4to paso (mensajes) — más corto que entre las dos llamadas (3 días,
// ver AUTO_CALL_RETRY_GAP_MS en voice.controller.ts) porque mandar un WhatsApp no
// necesita el mismo margen que esperar a que alguien note una llamada perdida.
const MESSAGE_STEP_GAP_MS = TEST_MODE ? 30 * 1000 : 1 * 24 * 60 * 60 * 1000

// Plantillas YA existentes y aprobadas — el usuario pidió usar lo que ya hay por ahora,
// con el entendido de que se van a afinar/cambiar más adelante. 'cobranza_recordatorio'
// es la única confirmada funcionando en otros flujos del backend (reminderScheduler,
// flowActions); 'ultimo_aviso' solo se había usado desde el picker manual de
// MessagesPage.tsx — si Meta la rechaza, queda registrado en logs para cambiarla.
const MESSAGE_TEMPLATE = 'cobranza_recordatorio'
const FINAL_WHATSAPP_TEMPLATE = 'ultimo_aviso'

// El usuario pidió explícitamente que el orden en que se llama a los clientes elegibles
// sea aleatorio (no siempre los mismos primero, ej. por orden de inserción en Mongo) —
// Fisher-Yates in-place.
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Con AUTO_CALL_TEST_GROUP_ONLY=true (o AUTO_CALL_TEST_MODE=true, que la implica), el
// ciclo automático SOLO corre sobre los clientes marcados como "Test Group Calls" en la
// tabla de Clients (mismos nombres que clientsPage.tsx usa para la etiqueta verde) — deja
// probar el flujo completo (llamadas + mensajes) sin arriesgar a la base de clientes real.
// Quitar ambas variables (o ponerlas en false) para que vuelva a correr sobre todos los
// clientes elegibles.


//const TEST_GROUP_FIRST_NAMES = ['Ever', 'Alberto', 'Laura', 'Ana', 'Francisco', 'Lourdes']
const TEST_GROUP_FIRST_NAMES = ['British', 'A', '911', '3m']



async function runAutoCallCycle(): Promise<void> {
  const settings = await AutomationSettings.findById('global').lean()
  if (!settings?.autoCallsEnabled) return

  const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
  if (!publicUrl) {
    console.error('[AutoCall] PUBLIC_URL no está configurado — no se pueden disparar llamadas automáticas.')
    return
  }

  const now = new Date()
  const cycleThreshold = new Date(now.getTime() - CYCLE_MS)

  // Elegibles: o nunca han tenido ciclo (o su ciclo ya lleva 7+ días, arranca uno
  // nuevo desde el paso 1), o están a la mitad de un ciclo esperando su siguiente paso
  // (2, 3 o 4) y ya toca.
  let candidates = await Client.find({
    debt: { $gt: 0 },
    phone: { $exists: true, $nin: [null, ''] },
    requiresHuman: { $ne: true },
    // Pago reportado/en proceso/domiciliado detectado por la IA (voz o WhatsApp) — ver
    // tarjeta "Exclusión automática de clientes del ciclo mensual de cobranza". Pausa
    // SOLO el ciclo automático, no toca debt/status — si la deuda sigue abierta el mes
    // que entra (el pago nunca se concretó), collectionExcludedUntil ya pasó y el
    // cliente vuelve a ser elegible normalmente, sin necesitar reincorporarlo a mano.
    $and: [{ $or: [{ collectionExcludedUntil: null }, { collectionExcludedUntil: { $lte: now } }] }],
    $or: [
      { autoCallCycleStartAt: null },
      { autoCallCycleStartAt: { $lte: cycleThreshold } },
      { autoCallAttempt: { $in: [1, 2, 3] }, autoCallNextAttemptAt: { $lte: now } },
    ],
  })
    // Pool generoso (no solo BATCH_SIZE*margen) para que el shuffle de abajo elija de
    // verdad entre todos los elegibles de esta corrida, no solo entre los primeros que
    // Mongo regresó en su orden por defecto.
    .limit(Math.max(BATCH_SIZE * 20, 200))
    .lean()

  // Aleatoriza qué candidatos entran en este lote — pedido explícito: no siempre llamar
  // a los mismos clientes primero (ej. los más viejos por orden de inserción).
  candidates = shuffle(candidates)

  if (TEST_GROUP_ONLY) {
    candidates = candidates.filter((c) =>
      TEST_GROUP_FIRST_NAMES.includes(String(c.name ?? '').trim().split(' ')[0])
    )
    console.log(`[AutoCall] Restringido al test group — ${candidates.length} candidato(s).`)
  }

  let dispatched = 0
  for (const client of candidates) {
    if (dispatched >= BATCH_SIZE) break

    const isNewCycle = !client.autoCallCycleStartAt || (client.autoCallCycleStartAt as Date) <= cycleThreshold
    const attemptNumber = isNewCycle ? 1 : ((client.autoCallAttempt as number) + 1)

    if (attemptNumber <= 2) {
      // Pasos 1 y 2: llamada — el resultado (respuesta o no) llega después por el
      // webhook de Twilio (ver advanceAutoCallCycle en voice.controller.ts), así que
      // aquí solo se dispara y se sigue.
      const activeCall = await Call.findOne({ phone: client.phone, status: 'in_progress' }).lean()
      if (activeCall) continue

      // Se marca ANTES de llamar (no después) para que, si el scheduler corre de nuevo
      // antes de que Twilio conteste el webhook, no se le dispare una segunda llamada al
      // mismo cliente por error.
      await Client.findByIdAndUpdate(client._id, {
        autoCallAttempt: attemptNumber,
        autoCallCycleStartAt: isNewCycle ? now : client.autoCallCycleStartAt,
        autoCallNextAttemptAt: null,
        ...(isNewCycle ? { autoCycleExhausted: false } : {}),
      })

      try {
        await placeOutboundCall(String(client._id), publicUrl, 'auto', settings.voiceEngine ?? 'openai')
        dispatched++
        console.log(`[AutoCall] Intento ${attemptNumber}/4 (llamada, motor ${settings.voiceEngine ?? 'openai'}) disparado: ${client.name} (${client.phone})`)
      } catch (err) {
        console.error(`[AutoCall] Error llamando a ${client.name} (${client._id}):`, err)
      }
      continue
    }

    // Pasos 3 y 4: mensaje de WhatsApp — a diferencia de la llamada, el envío es
    // síncrono (se sabe de inmediato si se mandó o no), así que aquí mismo se decide
    // el siguiente paso, sin depender de un webhook.
    const template = attemptNumber === 3 ? MESSAGE_TEMPLATE : FINAL_WHATSAPP_TEMPLATE
    try {
      await prepareWhatsappMessage({
        phone: client.phone,
        template,
        clientName: client.name,
        debt: client.debt,
        clientId: client._id,
        channel: 'auto-collection',
      })
      await Client.findByIdAndUpdate(client._id, {
        autoCallAttempt: attemptNumber,
        autoCallNextAttemptAt: attemptNumber === 4 ? null : new Date(now.getTime() + MESSAGE_STEP_GAP_MS),
        ...(attemptNumber === 4 ? { autoCycleExhausted: true } : {}),
      })
      dispatched++
      console.log(`[AutoCall] Intento ${attemptNumber}/4 (WhatsApp '${template}') disparado: ${client.name} (${client.phone})`)
    } catch (err) {
      // No se avanza el ciclo si el envío falló — se vuelve a intentar en la próxima
      // corrida del cron en vez de darlo por hecho.
      console.error(`[AutoCall] Error mandando WhatsApp a ${client.name} (${client._id}):`, err)
    }
  }

  if (dispatched > 0) {
    console.log(`[AutoCall] Ciclo completado: ${dispatched} paso(s) disparado(s).`)
  }
}

export function startAutoCallScheduler(): void {
  // En modo prueba corre cada 30 segundos (node-cron soporta un 1er campo opcional de
  // segundos), cualquier día/hora — para que el cron mismo no sea el cuello de botella al
  // probar el ciclo rápido. En producción, cada hora en punto y solo horario laboral
  // (lun-sáb 9am-6:59pm CDMX).
  const schedule = TEST_MODE ? '*/30 * * * * *' : '0 9-18 * * 1-6'
  cron.schedule(
    schedule,
    () => {
      runAutoCallCycle().catch((err) => console.error('[AutoCall] Error en ciclo automático:', err))
    },
    { timezone: 'America/Mexico_City' }
  )
  const timingDesc = TEST_MODE
    ? 'timing ACELERADO (cada 30s, sin restricción de horario/día)'
    : `timing real (lotes de ${BATCH_SIZE}, cada hora, lun-sáb 9am-7pm CDMX)`
  const groupDesc = TEST_GROUP_ONLY ? ' — restringido al test group' : ''
  console.log(`[AutoCall] Scheduler iniciado — ${timingDesc}${groupDesc}`)
}
