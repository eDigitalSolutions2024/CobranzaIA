import { Request, Response } from 'express'
import mongoose from 'mongoose'
import twilio from 'twilio'
import axios from 'axios'
import ExcelJS from 'exceljs'
import Call from '../models/Call'
import Client from '../models/Client'
import { findClientByPhone } from '../services/customerLookup.service'
import { analyzeCallTranscript, ClientInfo } from '../services/claudeVoice.service'
import { DispositionStatus, nextActionFor } from '../config/disposition'
import { CLIENT_REPORT_FIELDS, buildClientReportFilter } from '../utils/reportFilters'
import type { VoiceEngine } from '../models/AutomationSettings'

const CALL_STATUS_LABEL: Record<string, string> = {
  in_progress: 'En curso',
  completed: 'Completada',
  failed: 'Fallida',
  requires_human: 'Requiere asesor',
}

// Traduce lo que ya pasó en la llamada (qué function tool disparó el agente, o si
// nunca hubo conversación real) a un Status del catálogo fijo — no se le pregunta
// a una IA, se deriva de decisiones que la IA ya tomó en vivo durante la llamada
// (ver voiceStream.controller.ts, calledFunctions). "Prefers CAS support" se usa
// como el status más cercano a "se escaló a un humano" — el catálogo no tiene uno
// literal para eso.
function computeVoiceDisposition(calledFunctions: string[], relevantTurnCount: number): DispositionStatus {
  if (calledFunctions.includes('marcar_extension')) return 'Extension required'
  if (calledFunctions.includes('marcar_negativa_pago')) return 'Payment refused'
  if (calledFunctions.includes('marcar_pago_en_proceso')) return 'Payment in process'
  if (calledFunctions.includes('registrar_promesa_pago')) return 'Payment scheduled'
  if (calledFunctions.includes('marcar_saldo_pagado')) return 'Payment received'
  if (calledFunctions.includes('marcar_factura_no_recibida')) return 'Invoice, statement or contract required'
  if (calledFunctions.includes('requerir_humano') || calledFunctions.includes('marcar_ticket_aclaracion')) {
    return 'Prefers CAS support'
  }
  if (relevantTurnCount < 2) return 'Customer hung up'
  return 'Contact made - No resolution'
}

async function applyDisposition(
  callId: mongoose.Types.ObjectId,
  clientId: mongoose.Types.ObjectId | undefined | null,
  status: DispositionStatus
): Promise<void> {
  const nextAction = nextActionFor(status)
  await Call.findByIdAndUpdate(callId, { disposition: status, nextAction })
  if (clientId) {
    await Client.findByIdAndUpdate(clientId, { nextAction })
  }
}

// Con AUTO_CALL_TEST_MODE=true (mismo env var que autoCallScheduler.service.ts) los gaps
// se acortan a minutos, para poder ver el ciclo completo en una sola sesión de prueba en
// vez de esperar días reales.
const AUTO_CALL_TEST_MODE = process.env.AUTO_CALL_TEST_MODE === 'true'

// Cuánto esperar antes del siguiente paso del ciclo tras una llamada sin respuesta —
// entre las dos LLAMADAS (pasos 1->2) se da más margen que entre los MENSAJES que
// siguen (pasos 2->3->4, ver autoCallScheduler.service.ts para el resto del ciclo:
// arranca cada paso; esta función solo reacciona al RESULTADO de una llamada ya hecha).
const AUTO_CALL_RETRY_GAP_MS = AUTO_CALL_TEST_MODE ? 30 * 1000 : 3 * 24 * 60 * 60 * 1000
const AUTO_MESSAGE_GAP_MS = AUTO_CALL_TEST_MODE ? 30 * 1000 : 1 * 24 * 60 * 60 * 1000

// El usuario decidió qué cuenta como "no hubo respuesta" para reintentar: no contestó/
// ocupado/falló la conexión (disposition 'No answer', puesta directo en handleStatus) Y
// buzón de voz — que aquí se detecta indirectamente vía 'Customer hung up' (menos de 2
// turnos reales de conversación es la misma señal que usa computeVoiceDisposition, sin
// necesitar activar detección de máquina de Twilio y meterle latencia a la llamada real).
// Cualquier OTRA disposition significa que sí hubo una persona real en la línea — ahí se
// detiene el ciclo automático de la semana, ya hubo contacto.
const AUTO_CALL_NO_RESPONSE_DISPOSITIONS = new Set<DispositionStatus>(['No answer', 'Customer hung up', 'Voice mail'])

async function advanceAutoCallCycle(
  clientId: mongoose.Types.ObjectId | undefined | null,
  disposition: DispositionStatus
): Promise<void> {
  if (!clientId) return
  const client = await Client.findById(clientId)
  if (!client) return

  if (!AUTO_CALL_NO_RESPONSE_DISPOSITIONS.has(disposition)) {
    // Contestó una persona real — se detiene el ciclo automático de esta semana.
    client.autoCallNextAttemptAt = null
    await client.save()
    return
  }

  // Sin respuesta — programa el siguiente paso. Qué TIPO de paso es (llamada o mensaje)
  // lo decide el scheduler según el número de intento cuando le toque correr, aquí solo
  // se define CUÁNDO.
  const gapMs = (client.autoCallAttempt as number) >= 2 ? AUTO_MESSAGE_GAP_MS : AUTO_CALL_RETRY_GAP_MS
  client.autoCallNextAttemptAt = new Date(Date.now() + gapMs)
  await client.save()
}

const { VoiceResponse } = twilio.twiml
const VOICE = 'Polly.Mia-Neural' as const
const LANGUAGE = 'es-MX' as const

// Sanitiza texto antes de mandarlo a hablar (a Polly como fallback, o como instrucción
// a la Realtime API de OpenAI en voiceStream.controller.ts).
export function cleanText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function getBaseUrl(req: Request): string {
  const host = req.headers['x-forwarded-host'] ?? req.get('host') ?? 'localhost:3003'
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https'
  return `${proto}://${host}`
}

// Grabar tiene un costo recurrente de Twilio (grabación + almacenamiento, aparte del
// minuto de voz normal) — apagado por defecto para no pagarlo en todas las llamadas.
// Prender solo puntualmente (ej. para diagnosticar un caso de transcripción rara) con
// VOICE_CALL_RECORDING_ENABLED=true en .env, sin necesidad de tocar código.
function isRecordingEnabled(): boolean {
  return process.env.VOICE_CALL_RECORDING_ENABLED === 'true'
}

// 'dual' guarda al cliente y al agente en canales separados del mismo archivo, para
// poder aislar la voz real del cliente y compararla contra lo que transcribió
// gpt-4o-transcribe (ver getCallRecording más abajo).
function recordingParams(publicUrl: string): Record<string, unknown> {
  if (!isRecordingEnabled()) return {}
  return {
    record: true,
    recordingChannels: 'dual',
    recordingStatusCallback: `${publicUrl}/api/voice/recording-status`,
    recordingStatusCallbackEvent: ['completed'],
    recordingStatusCallbackMethod: 'POST',
  }
}

function speakSegments(say: ReturnType<InstanceType<typeof VoiceResponse>['say']>, message: string): void {
  const sentences = cleanText(message)
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (sentences.length === 0) return

  sentences.forEach((sentence, i) => {
    say.s(sentence)
    if (i === 0 && sentences.length > 1) {
      say.break({ time: '200ms' })
    }
  })
}

// Fallback: solo se usa si no se pudo ni siquiera arrancar el puente hacia OpenAI
// Realtime (ej. falta OPENAI_API_KEY, o la llamada falla antes de conectar el stream).
// Número fijo del agente humano al que se avisa cuando un caso queda marcado
// REQUIERE_HUMANO — configurable por .env sin necesitar redeploy.
const HUMAN_AGENT_PHONE = process.env.HUMAN_AGENT_PHONE || '3319242792'

export function sayAndHangup(message: string): string {
  const twiml = new VoiceResponse()
  speakSegments(twiml.say({ voice: VOICE, language: LANGUAGE }, ''), message)
  twiml.hangup()
  return twiml.toString()
}

function errorResponse(): string {
  return sayAndHangup('Lo sentimos, tenemos un problema técnico. Por favor intente más tarde.')
}

// Entrega el control de la llamada al WebSocket de audio en tiempo real
// (voiceStream.controller.ts), que puentea Twilio <-> OpenAI Realtime API.
// El callSid no se manda por query string (Twilio no lo conserva de forma confiable
// ahí) — voiceStream.controller.ts lo obtiene del propio evento "start" del stream.
function connectStream(baseUrl: string): string {
  const twiml = new VoiceResponse()
  const wsUrl = baseUrl.replace(/^http/, 'ws')
  twiml.connect().stream({ url: `${wsUrl}/api/voice/stream` })
  return twiml.toString()
}

export async function getCalls(req: Request, res: Response): Promise<void> {
  try {
    const clientFilter = buildClientReportFilter(req.query)
    const callFilter: Record<string, any> = {}
    // Solo restringe por cliente si de verdad se mandó algún filtro — evita un $in: []
    // (que traería 0 resultados) cuando no hay ningún filtro de Country/Team/etc activo.
    if (Object.keys(clientFilter).length > 0) {
      const matchingClients = await Client.find(clientFilter).select('_id').lean()
      callFilter.clientId = { $in: matchingClients.map((c) => c._id) }
    }

    const calls = await Call.find(callFilter)
      .populate('clientId', `debt status ${CLIENT_REPORT_FIELDS}`)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    res.json(calls)
  } catch (err) {
    console.error('[Voice] getCalls error:', err)
    res.status(500).json({ error: 'Error al obtener llamadas' })
  }
}

// Descarga en Excel de las llamadas, filtradas por los mismos 5 campos de Client que
// pide la tarjeta "Reporte Filters" (Country/Collector ID/Team/Team Leader/Collector) —
// compartidos con GET /calls y con los filtros del Dashboard (ver ReportFilters.tsx en
// el frontend). A diferencia de GET /calls (limit 100, para la tabla en vivo), aquí no
// hay límite — es un reporte, tiene que traer todo lo que matchee el filtro.
export async function exportCalls(req: Request, res: Response): Promise<void> {
  try {
    const clientFilter = buildClientReportFilter(req.query)
    const callFilter: Record<string, any> = {}
    if (Object.keys(clientFilter).length > 0) {
      const matchingClients = await Client.find(clientFilter).select('_id').lean()
      callFilter.clientId = { $in: matchingClients.map((c) => c._id) }
    }
    const status = String(req.query.status ?? '')
    if (status && status !== 'all') callFilter.status = status

    let calls = await Call.find(callFilter)
      .populate('clientId', CLIENT_REPORT_FIELDS)
      .sort({ createdAt: -1 })
      .lean()

    // 'search' (nombre/teléfono) no se traduce a Mongo porque el nombre vive en el
    // cliente relacionado, no en Call — más simple filtrarlo aquí ya con todo populado,
    // igual que el buscador de la tabla en el frontend.
    const search = String(req.query.search ?? '').trim().toLowerCase()
    if (search) {
      calls = calls.filter((call: any) => {
        const name = String(call.clientId?.name ?? '').toLowerCase()
        const phone = String(call.phone ?? '').toLowerCase()
        return name.includes(search) || phone.includes(search)
      })
    }

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Llamadas')
    sheet.columns = [
      { header: 'Country', key: 'country', width: 12 },
      { header: 'CollectorID', key: 'collectorId', width: 12 },
      { header: 'Team', key: 'team', width: 14 },
      { header: 'TeamLeader', key: 'teamLeader', width: 16 },
      { header: 'Collector', key: 'collector', width: 16 },
      { header: 'Cliente', key: 'name', width: 25 },
      { header: 'Teléfono', key: 'phone', width: 15 },
      { header: 'Fecha', key: 'createdAt', width: 18 },
      { header: 'Duración (min)', key: 'durationMin', width: 14 },
      { header: 'Tipo', key: 'triggeredBy', width: 12 },
      { header: 'Estado', key: 'status', width: 15 },
      { header: 'Disposition', key: 'disposition', width: 24 },
      { header: 'Next Action', key: 'nextAction', width: 18 },
      { header: 'Monto promesa', key: 'amount', width: 14 },
      { header: 'Fecha promesa', key: 'promiseDate', width: 16 },
      { header: 'Requiere asesor', key: 'requiresHuman', width: 16 },
      { header: 'Buzón de voz', key: 'detectedVoicemail', width: 14 },
      { header: 'Resumen', key: 'summary', width: 40 },
      { header: 'Transcript', key: 'transcript', width: 60 },
    ]
    sheet.addRows(
      calls.map((call: any) => {
        const client = call.clientId
        const transcriptText = (call.transcript || [])
          .map((t: any) => `${t.role === 'assistant' ? 'IA' : 'Cliente'}: ${t.content}`)
          .join(' | ')
        return {
          country: client?.country || '',
          collectorId: client?.collectorId ?? '',
          team: client?.team || '',
          teamLeader: client?.teamLeader || '',
          collector: client?.collector || '',
          name: client?.name || '—',
          phone: call.phone || client?.phone || '—',
          createdAt: call.createdAt ? new Date(call.createdAt) : null,
          durationMin: call.durationSeconds != null ? Math.round((call.durationSeconds / 60) * 10) / 10 : '',
          triggeredBy: call.triggeredBy === 'auto' ? 'Automática' : 'Manual',
          status: CALL_STATUS_LABEL[call.status as string] || call.status,
          disposition: call.disposition || '',
          nextAction: call.nextAction || '',
          amount: call.amount || '',
          promiseDate: call.promiseDate ? new Date(call.promiseDate) : '',
          requiresHuman: call.requiresHuman ? 'Sí' : 'No',
          detectedVoicemail: call.detectedVoicemail ? 'Sí' : 'No',
          summary: call.summary || '',
          transcript: transcriptText,
        }
      })
    )
    sheet.getRow(1).font = { bold: true }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `cobranzaia-llamadas-${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('[Voice] exportCalls error:', err)
    res.status(500).json({ error: 'Error exportando llamadas a Excel' })
  }
}

// Compartido entre el botón "Call" del dashboard (handleOutbound), el scheduler de
// llamadas automáticas (autoCallScheduler.service.ts) y el botón "Test ElevenLabs"
// (handleOutboundCartesia). `engine` solo cambia a QUÉ webhook de Twilio se conecta el
// audio: todo lo demás (extensión de conmutador, grabación, límite de tiempo, creación
// del Call, disposición y avance del ciclo automático en handleStatus) es idéntico para
// los dos motores — así ElevenLabs se comporta igual que OpenAI en el ciclo automático.
export async function placeOutboundCall(
  clientId: string,
  publicUrl: string,
  triggeredBy: 'manual' | 'auto' = 'manual',
  engine: VoiceEngine = 'openai'
): Promise<{ callSid: string; status: string }> {
  const client = await Client.findById(clientId).lean()
  if (!client) throw new Error('Cliente no encontrado')

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const rawPhone = client.phone as string
  const basePhone = rawPhone.startsWith('+') ? rawPhone : `+52${rawPhone.replace(/\D/g, '')}`

  // Si ya sabemos (de una llamada anterior, ver marcar_extension en
  // voiceStream.controller.ts) que este cliente tiene conmutador, marcamos directo con
  // la extensión incluida — cada coma es ~2s de pausa en Twilio, dándole tiempo al
  // conmutador de terminar su saludo antes de que "presionemos" el número. El "#" cierra
  // la marcación en conmutadores que lo requieren para confirmar la extensión.
  const toPhone = client.knownExtension ? `${basePhone},,,,${client.knownExtension}#` : basePhone

  const call = await twilioClient.calls.create({
    to: toPhone,
    from: process.env.TWILIO_PHONE_NUMBER!,
    url: `${publicUrl}/api/voice/${engine === 'elevenlabs' ? 'incoming-cartesia' : 'incoming'}?clientId=${clientId}`,
    statusCallback: `${publicUrl}/api/voice/status`,
    statusCallbackMethod: 'POST',
    // Respaldo duro independiente de nuestra propia lógica de colgado: si el modelo
    // dice una frase de cierre nueva que looksLikeHangupIntent() todavía no cubre (ya
    // pasó en producción — se quedó una llamada conectada indefinidamente porque dijo
    // "le devolvemos la llamada" sin llamar a finalizar_llamada), Twilio corta solo a
    // los 10 minutos. Ninguna llamada real de este proyecto ha pasado de ~2 minutos.
    timeLimit: 600,
    ...recordingParams(publicUrl),
  })

  // Se crea el Call AQUÍ, no cuando Twilio conteste — Twilio solo pide /incoming si
  // alguien LEVANTA el teléfono; si nadie contesta (no-answer/busy/failed), Twilio manda
  // directo el statusCallback final SIN pasar nunca por /incoming, y handleStatus se
  // quedaba buscando un Call que nunca se había creado (confirmado en pruebas del
  // ciclo automático: llamadas sin respuesta se quedaban con el ciclo congelado para
  // siempre porque advanceAutoCallCycle nunca se llegaba a ejecutar).
  await Call.create({
    phone: basePhone,
    clientId: client._id,
    callSid: call.sid,
    transcript: [],
    status: 'in_progress',
    requiresHuman: false,
    triggeredBy,
  })

  return { callSid: call.sid, status: call.status }
}

export async function handleOutbound(req: Request, res: Response): Promise<void> {
  const { clientId } = req.body as { clientId: string }

  try {
    const publicUrl = (process.env.PUBLIC_URL ?? getBaseUrl(req)).replace(/\/$/, '')
    const result = await placeOutboundCall(clientId, publicUrl, 'manual')
    res.json(result)
  } catch (err: any) {
    console.error('[Voice] handleOutbound error:', err)
    if (err.message === 'Cliente no encontrado') {
      res.status(404).json({ error: 'Cliente no encontrado' })
      return
    }
    res.status(500).json({ error: 'Error al iniciar llamada' })
  }
}

// Llamada informativa (no bridging en vivo) al agente humano fijo — se dispara solo con
// el botón del dashboard, nunca automático. Lee los datos del caso con TTS y cuelga; el
// agente humano marca al cliente por su cuenta después de escuchar el aviso.
export async function handleNotifyHuman(req: Request, res: Response): Promise<void> {
  const { clientId } = req.body as { clientId: string }

  try {
    const client = await Client.findById(clientId)
    if (!client) {
      res.status(404).json({ error: 'Cliente no encontrado' })
      return
    }

    const reason = client.requiresHumanReason as string | null
    const reasonText = reason ? ` Motivo: ${reason}.` : ''
    const message = `Aviso del sistema de cobranza. El cliente ${client.name}, teléfono ${client.phone}, requiere atención de un agente humano.${reasonText}`

    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const toPhone = HUMAN_AGENT_PHONE.startsWith('+') ? HUMAN_AGENT_PHONE : `+52${HUMAN_AGENT_PHONE.replace(/\D/g, '')}`
    const publicUrl = (process.env.PUBLIC_URL ?? getBaseUrl(req)).replace(/\/$/, '')

    const call = await twilioClient.calls.create({
      to: toPhone,
      from: process.env.TWILIO_PHONE_NUMBER!,
      twiml: sayAndHangup(message),
      // Detecta si contestó una persona o un buzón de voz — no cambia lo que se dice,
      // solo nos deja ver en logs si el aviso realmente llegó a alguien en vivo.
      machineDetection: 'Enable',
      statusCallback: `${publicUrl}/api/voice/notify-human-status`,
      statusCallbackEvent: ['completed'],
      statusCallbackMethod: 'POST',
    })

    client.requiresHuman = false
    await client.save()

    res.json({ callSid: call.sid, status: call.status })
  } catch (err) {
    console.error('[Voice] handleNotifyHuman error:', err)
    res.status(500).json({ error: 'Error al notificar al agente' })
  }
}

// Webhook público de Twilio: la grabación (si VOICE_CALL_RECORDING_ENABLED=true) ya
// terminó y quedó lista para descargar — se guarda solo el SID, el audio se sirve bajo
// demanda vía getCallRecording (nunca se guarda la URL/credenciales de Twilio en el
// frontend).
export async function handleRecordingStatus(req: Request, res: Response): Promise<void> {
  const { CallSid, RecordingSid, RecordingStatus } = req.body as Record<string, string>
  try {
    if (RecordingStatus === 'completed' && CallSid && RecordingSid) {
      await Call.findOneAndUpdate({ callSid: CallSid }, { recordingSid: RecordingSid })
    }
    res.sendStatus(200)
  } catch (err) {
    console.error('[Voice] handleRecordingStatus error:', err)
    res.sendStatus(500)
  }
}

// Sirve el audio de la grabación de una llamada al frontend (requireAuth) — hace de
// proxy autenticado hacia la API de Twilio, que exige Basic Auth con el Account SID y
// Auth Token; esas credenciales nunca deben llegar al navegador.
export async function getCallRecording(req: Request, res: Response): Promise<void> {
  try {
    const call = await Call.findById(req.params.id).lean()
    if (!call?.recordingSid) {
      res.status(404).json({ error: 'Esta llamada no tiene grabación' })
      return
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!
    const authToken = process.env.TWILIO_AUTH_TOKEN!
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${call.recordingSid}.mp3`

    const upstream = await axios.get(twilioUrl, {
      auth: { username: accountSid, password: authToken },
      responseType: 'stream',
    })

    res.setHeader('Content-Type', 'audio/mpeg')
    upstream.data.pipe(res)
  } catch (err) {
    console.error('[Voice] getCallRecording error:', err)
    res.status(500).json({ error: 'Error al obtener la grabación' })
  }
}

// Webhook público de Twilio (statusCallback de handleNotifyHuman) — deja rastro en logs.
export async function handleNotifyHumanStatus(req: Request, res: Response): Promise<void> {
  const { CallSid, CallStatus, CallDuration, AnsweredBy } = req.body as Record<string, string>
  console.log(
    `[Voice] Aviso a agente humano CallSid=${CallSid} status=${CallStatus} duración=${CallDuration}s contestó=${AnsweredBy ?? 'desconocido'}`
  )
  res.sendStatus(200)
}

// El dashboard hace polling de esto tras lanzar el aviso, para mostrar en vivo si contestó
// el agente o cayó a buzón — se consulta directo a Twilio, no depende de que el webhook de
// arriba ya haya llegado.
export async function getNotifyHumanStatus(req: Request, res: Response): Promise<void> {
  const callSid = String(req.params.callSid)

  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const call = await twilioClient.calls(callSid).fetch()
    res.json({ status: call.status, answeredBy: call.answeredBy, duration: call.duration })
  } catch (err) {
    console.error('[Voice] getNotifyHumanStatus error:', err)
    res.status(500).json({ error: 'Error al consultar el estado de la llamada' })
  }
}

export async function handleIncoming(req: Request, res: Response): Promise<void> {
  const receivedAt = Date.now()
  const { CallSid, From, To } = req.body as { CallSid: string; From: string; To: string }
  const clientIdParam = req.query.clientId as string | undefined

  try {
    let clientId: mongoose.Types.ObjectId | undefined
    let callerPhone: string

    if (clientIdParam) {
      // Llamada OUTBOUND (manual o automática) — el Call ya se creó en
      // placeOutboundCall al disparar la llamada, ANTES de que Twilio la conteste (ver
      // comentario ahí: si nadie contesta, este webhook /incoming nunca llega, así que
      // no podíamos esperar hasta aquí para crearlo). No se vuelve a crear — el callSid
      // es único, intentarlo de nuevo tronaría con un error de duplicado.
      callerPhone = To
      const client = await Client.findById(clientIdParam).lean()
      if (client) clientId = client._id as mongoose.Types.ObjectId
    } else {
      // Llamada INBOUND real (alguien marcó al número de Twilio) — esta sí es la
      // primera vez que sabemos de ella, se registra aquí.
      callerPhone = From
      const found = await findClientByPhone(From)
      clientId = found?._id

      await Call.create({
        phone: callerPhone,
        clientId,
        callSid: CallSid,
        transcript: [],
        status: 'in_progress',
        requiresHuman: false,
        triggeredBy: 'manual',
      })
    }

    // Las llamadas OUTBOUND ya piden grabación al crearse (handleOutbound, record:true) —
    // aquí solo hace falta pedirla por REST para llamadas INBOUND reales (clientIdParam
    // ausente), que nunca pasaron por calls.create() de nuestro lado.
    if (!clientIdParam && isRecordingEnabled()) {
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
      const publicUrl = (process.env.PUBLIC_URL ?? getBaseUrl(req)).replace(/\/$/, '')
      twilioClient
        .calls(CallSid)
        .recordings.create({
          recordingChannels: 'dual',
          recordingStatusCallback: `${publicUrl}/api/voice/recording-status`,
          recordingStatusCallbackEvent: ['completed'],
          recordingStatusCallbackMethod: 'POST',
        })
        .catch((err) => console.error('[Voice] Error iniciando grabación inbound:', err))
    }

    console.log(`[Voice][latency] callSid=${CallSid} turn=start totalMs=${Date.now() - receivedAt}`)
    res.type('text/xml').send(connectStream(getBaseUrl(req)))
  } catch (err) {
    console.error('[Voice] handleIncoming error:', err)
    res.type('text/xml').send(errorResponse())
  }
}

// Lógica pura (sin req/res) para que la pueda usar tanto el webhook real de Twilio
// (handleStatus) como el job de reconciliación (callReconciliation.service.ts) que
// arregla llamadas que se quedaron 'in_progress' para siempre porque este webhook nunca
// llegó (ej. el backend se reinició justo cuando Twilio intentó avisar).
export async function processCallStatusUpdate(
  callSid: string,
  callStatus: string,
  durationSeconds: number | null
): Promise<void> {
  if (['busy', 'failed', 'no-answer', 'canceled'].includes(callStatus)) {
    const call = await Call.findOneAndUpdate(
      { callSid, status: 'in_progress' },
      { status: 'failed', ...(durationSeconds !== null ? { durationSeconds } : {}) }
    )
    // El cliente nunca contestó — no hay conversación que analizar, el status se
    // sabe directo del propio evento de Twilio, sin necesidad de IA.
    if (call) {
      await applyDisposition(call._id as mongoose.Types.ObjectId, call.clientId, 'No answer')
      if (call.triggeredBy === 'auto') await advanceAutoCallCycle(call.clientId, 'No answer')
    }
  } else if (callStatus === 'completed') {
    // Marca como completadas las llamadas que se cortaron a media conversación
    await Call.findOneAndUpdate(
      { callSid, status: 'in_progress' },
      { status: 'completed', ...(durationSeconds !== null ? { durationSeconds } : {}) }
    )
    if (durationSeconds !== null) {
      await Call.findOneAndUpdate({ callSid, status: { $ne: 'in_progress' } }, { durationSeconds })
    }

    // Resumen legible para el CRM. Ya no crea promesas de pago aquí: eso lo hace
    // voiceStream.controller.ts en vivo, en cuanto el agente marca PROMESA_PAGO.
    const call = await Call.findOne({ callSid, summary: null })
    if (!call) return

    const relevantTurns = call.transcript.filter((t) => !t.content.startsWith('['))
    // detectedVoicemail manda ANTES que el conteo de turnos — el saludo grabado del
    // buzón se transcribe como "user" y por conteo de turnos parecía una conversación
    // real (>= 2 renglones), clasificando como 'Contact made - No resolution' en vez de
    // 'Voice mail'. Eso detenía el ciclo automático como si hubiera contestado una
    // persona, en vez de programar el reintento.
    const disposition = call.detectedVoicemail
      ? 'Voice mail'
      : computeVoiceDisposition(call.calledFunctions ?? [], relevantTurns.length)
    await applyDisposition(call._id as mongoose.Types.ObjectId, call.clientId, disposition)
    if (call.triggeredBy === 'auto') await advanceAutoCallCycle(call.clientId, disposition)

    if (relevantTurns.length < 2) return

    const populated = call.clientId ? await Client.findById(call.clientId).lean() : null
    const clientInfo: ClientInfo | null = populated
      ? {
          _id: populated._id as mongoose.Types.ObjectId,
          name: populated.name as string,
          debt: (populated.debt as number) ?? 0,
          status: populated.status as string,
          phone: populated.phone as string,
        }
      : null

    const analysis = await analyzeCallTranscript(call.transcript, clientInfo)
    call.summary = analysis.summary
    // Suma (no sobrescribe): en llamadas por ElevenLabs Claude ya consumió tokens durante
    // la conversación (ver voiceStreamCartesia.controller.ts). En llamadas de OpenAI esto
    // arranca en 0, así que el resultado es el mismo de siempre.
    call.claudeUsage = {
      inputTokens: (call.claudeUsage?.inputTokens ?? 0) + analysis.usage.inputTokens,
      outputTokens: (call.claudeUsage?.outputTokens ?? 0) + analysis.usage.outputTokens,
    }
    await call.save()
    console.log(`[Voice] Resumen post-llamada CallSid ${callSid}: ${analysis.summary}`)
  }
}

export async function handleStatus(req: Request, res: Response): Promise<void> {
  const { CallSid, CallStatus, CallDuration } = req.body as { CallSid: string; CallStatus: string; CallDuration?: string }
  // CallDuration solo viene poblado en el statusCallback final (Twilio lo calcula al
  // colgar) — se guarda en cualquier status terminal, no solo 'completed'.
  const durationSeconds = CallDuration !== undefined ? Number(CallDuration) : null

  try {
    await processCallStatusUpdate(CallSid, CallStatus, durationSeconds)
    res.sendStatus(200)
  } catch (err) {
    console.error('[Voice] handleStatus error:', err)
    res.sendStatus(500)
  }
}
