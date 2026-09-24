import { IncomingMessage } from 'http'
import WebSocket from 'ws'
import mongoose from 'mongoose'
import Call from '../models/Call'
import Client from '../models/Client'
import { runAction } from '../services/flowActions.service'
import { OpenAIRealtimeSession, RealtimeFunctionCall, RealtimeUsage } from '../services/openaiRealtime.service'
import { buildVoiceSystemPrompt, buildTranscriptionPrompt, ClientInfo } from '../services/voiceConversation.service'
import { normalizeRFC } from '../utils/rfc'
import { loadInvoiceSummary } from '../services/invoiceSummary.service'
import { placeOutboundCall } from './voice.controller'

// Red de seguridad para cuando el modelo DICE que va a colgar sin llamar a la
// función real (ver uso en 'agentTranscript' más abajo) — frases que el propio
// prompt le sugiere usar como cierre, así que son una señal confiable de que
// la llamada ya debería terminar aunque no haya llegado la tool call.
function looksLikeHangupIntent(text: string): boolean {
  const t = text.toLowerCase()
  return (
    t.includes('finalizar la llamada') ||
    t.includes('terminar la llamada') ||
    t.includes('voy a colgar') ||
    // Cierre de buzón de voz (ver voiceConversation.service.ts) — capa extra por si el
    // modelo parafrasea en vez de usar la frase exacta sugerida en el prompt. Confirmado
    // en producción: el modelo dijo esto y NUNCA llamó a finalizar_llamada, dejando la
    // llamada conectada indefinidamente (Twilio la reportaba 'in-progress' sin fin).
    t.includes('le devolvemos la llamada')
  )
}

// Puente de audio Twilio <-> OpenAI Realtime. El modelo conversa libre (guiado por el
// prompt de voiceConversation.service.ts) y dispara las acciones de negocio
// (flowActions.service.ts) llamando a las funciones (tools) definidas en VOICE_TOOLS —
// ya no se parsean marcadores de texto del habla del agente, eso resultó poco confiable
// (el modelo a veces decía "voy a registrar esto" sin emitir el marcador real).
// A diferencia de la versión anterior basada en flowEngine.service.ts (máquina de estados
// que exigía coincidencias exactas de texto), esto tolera que la transcripción de voz no
// sea perfecta — si el modelo no entendió, simplemente vuelve a preguntar de forma natural.
export async function handleMediaStream(twilioWs: WebSocket, _req: IncomingMessage): Promise<void> {
  let streamSid: string | null = null
  let callDocId: mongoose.Types.ObjectId | null = null
  let isAgentSpeaking = false
  let shouldHangup = false
  // Cuando requerir_humano/finalizar_llamada disparan una respuesta nueva para la
  // despedida (ver handleFunctionCall), hay que colgar hasta que ESA respuesta termine,
  // no con el responseDone de la respuesta anterior (la que llamó a la función) — si no,
  // se corta la llamada antes de que alcance a decir la despedida.
  let awaitingHangupResponseCreation = false
  let hangupAfterResponseId: string | null = null
  // requerir_humano/finalizar_llamada NO piden la respuesta de despedida al momento —
  // la Realtime API rechaza (o corta) response.create si la respuesta ACTUAL sigue activa
  // ("Conversation already has an active response"), y esa respuesta actual puede seguir
  // hablando (ej. el aviso de "un agente se pondrá en contacto") cuando el modelo llama a
  // la función. Se marca esta bandera y se pide la despedida hasta el responseDone de esa
  // respuesta en curso — antes cortaba la frase a medias por esta condición de carrera.
  let pendingFarewellTrigger = false
  // Mismo problema que pendingFarewellTrigger de arriba, pero genérico: CUALQUIER
  // function call que pida un turno de seguimiento (confirmar_identidad, registrar
  // promesa, marcar domiciliado, etc.) puede llegar mientras la respuesta ACTUAL —
  // la que contiene esa misma llamada a función — todavía está generando/enviando
  // su propio audio (ej. "Entiendo, voy a registrar que está domiciliado..."). Llamar
  // session.createResponse() ahí mismo, dentro de handleFunctionCall, choca con esa
  // respuesta activa y la corta a media frase (visto en producción con
  // marcar_pago_domiciliado — se cortó justo al decir "Entiendo"). Se difiere al
  // responseDone de esa misma respuesta, igual que la despedida.
  let pendingResponseCreate = false
  // true entre responseCreated y responseDone de la respuesta EN CURSO. handleFunctionCall
  // es async y espera operaciones reales de Mongo (Call.findById, Ticket.create, etc.)
  // antes de decidir si pide un turno de seguimiento — el response.done de ESA MISMA
  // respuesta puede llegar por el WebSocket y procesarse ANTES de que esos awaits
  // terminen (visto en producción con marcar_pago_domiciliado: la función sí se
  // ejecutó, pero el agente se quedó callado hasta que el cliente volvió a hablar,
  // porque responseDone ya había pasado sin ver pendingResponseCreate en true todavía).
  // Por eso no basta con "marcar la bandera y esperar responseDone" — hay que revisar
  // este flag al momento de pedir el turno de seguimiento: si la respuesta ya terminó,
  // es seguro pedirlo de inmediato; si sigue activa, ahí sí se difiere a responseDone.
  let responseActive = false
  // Si la respuesta de despedida sale vacía (el modelo solo vuelve a llamar a una función
  // sin decir nada), reintentamos pedirle que hable antes de colgar — máximo un par de
  // veces, para no quedarnos esperando para siempre si el modelo simplemente no quiere
  // hablar más.
  let hangupFarewellSpoken = false
  let hangupRetries = 0
  const MAX_HANGUP_RETRIES = 2
  // Último transcript del agente, para la red de seguridad de looksLikeHangupIntent() —
  // se evalúa recién en responseDone (ver ahí el porqué), no en el momento en que llega.
  let lastAgentTranscript: string | null = null
  let ready = false
  let closed = false
  const pendingAudio: string[] = []
  // Nombre del 'mark' que mandamos a Twilio después del último audio antes de colgar —
  // Twilio lo regresa (evento 'mark') solo hasta que YA REPRODUJO todo el audio en cola,
  // no cuando lo recibió. Cerrar con esto en vez de con responseDone evita cortar la
  // despedida a media frase (responseDone solo dice que OpenAI terminó de GENERAR el
  // audio, no que Twilio ya lo sacó por la bocina del teléfono).
  let pendingHangupMark: string | null = null
  let hangupMarkTimeout: NodeJS.Timeout | null = null
  // Audio PCMU a 8kHz mono = 8000 muestras/seg, 1 byte/muestra = 8 bytes por milisegundo.
  // Modela la cola de reproducción REAL de Twilio: cada chunk de audio que mandamos se
  // "encola" después de lo que ya estaba pendiente (si la cola seguía llena) o a partir
  // de ahora mismo (si ya se había vaciado — ej. tras el silencio mientras hablaba el
  // cliente). queueDrainCompleteAt = el momento (Date.now()-style) en que Twilio habrá
  // terminado de reproducir TODO lo que le hemos mandado hasta ahora.
  //
  // Reemplaza un primer intento (firstAudioSentAt/totalAudioMsSent: "audio total enviado
  // en TODA la llamada" menos "tiempo real transcurrido desde el PRIMER audio de la
  // llamada") que parecía razonable pero se rompía en cuanto había más de un turno con
  // silencio entre medio — el denominador ("tiempo transcurrido") sigue avanzando durante
  // esos silencios aunque no haya nada que reproducir, así que el backlog calculado caía
  // a 0 mucho antes de que la cola realmente se vaciara. Confirmado con datos reales: una
  // llamada de 7 turnos terminó con Twilio reportando 83s de duración cuando el audio
  // encolado necesitaba ~92s para reproducirse completo — la despedida final ("Perfecto,
  // he registrado... Voy a finalizar la llamada" + "Adiós, que estés muy bien") se cortó
  // a media frase porque el timeout de seguridad de hangupAfterPlayback() calculó
  // backlog=0 (el cálculo viejo daba negativo, clampeado a 0) y cerró la llamada casi de
  // inmediato en vez de esperar los ~10s reales que todavía faltaban por sonar.
  const BYTES_PER_MS = 8
  let queueDrainCompleteAt = 0

  // --- Métricas de tiempo del flujo (para el modal de la llamada) ---
  // Momento en que arrancó la llamada (evento 'start' de Twilio) — ancla de todos los
  // "elapsedMs" (en qué momento del flujo ocurrió cada mensaje/función).
  let callStartAt: number | null = null
  // Cuándo terminó (estimado) el turno anterior — sirve para medir cuánto tardó en
  // ARRANCAR el turno siguiente, sea de la IA o del cliente.
  let lastTurnEndAt: number | null = null
  // Cuándo empezó a sonar el audio de la respuesta EN CURSO y cuánto audio lleva —
  // permite separar "cuánto tardó la IA en empezar a contestar" (latencyMs) de "cuánto
  // tardó en terminar de decir el mensaje completo" (durationMs). Se reinicia en cada
  // responseCreated — es independiente de queueDrainCompleteAt de arriba, que sigue
  // acumulado a través de TODA la llamada (para el cálculo de colgado).
  let currentResponseAudioStartAt: number | null = null
  let currentResponseAudioMs = 0
  // Cuándo empezó a hablar el cliente en su turno actual (input_audio_buffer.speech_started).
  let currentUserSpeechStartAt: number | null = null

  const session = new OpenAIRealtimeSession()

  function audioBacklogMs(): number {
    return Math.max(0, queueDrainCompleteAt - Date.now())
  }

  function closeAll(): void {
    if (closed) return
    closed = true
    if (hangupMarkTimeout) {
      clearTimeout(hangupMarkTimeout)
      hangupMarkTimeout = null
    }
    session.close()
    try {
      twilioWs.close()
    } catch {
      // ya pudo estar cerrado por el lado de Twilio
    }
  }

  function hangupAfterPlayback(): void {
    if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) {
      closeAll()
      return
    }
    const markName = `hangup-${Date.now()}`
    pendingHangupMark = markName
    twilioWs.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: markName } }))
    // El 'mark' de Twilio (ver case 'mark' abajo) cierra antes si llega — esto es solo
    // la red de seguridad, dimensionada al audio real que falta por reproducir, con un
    // margen y un tope máximo por si el conteo de bytes se desfasa por algún error.
    const safetyDelay = Math.min(20000, Math.max(500, audioBacklogMs() + 500))
    hangupMarkTimeout = setTimeout(() => {
      if (pendingHangupMark === markName) closeAll()
    }, safetyDelay)
  }

  session.on('error', (err) => {
    console.error('[VoiceStream] Error de OpenAI Realtime:', err)
  })

  // Se acumula con $inc (no overwrite) porque llegan varios response.done por llamada,
  // uno por cada turno del agente — cada uno suma sus propios tokens al total de la Call.
  function persistOpenAIUsage(usage: RealtimeUsage): void {
    if (!callDocId) return
    Call.findByIdAndUpdate(callDocId, {
      $inc: {
        'openaiUsage.totalTokens': usage.totalTokens,
        'openaiUsage.inputTokens': usage.inputTokens,
        'openaiUsage.outputTokens': usage.outputTokens,
        'openaiUsage.inputTextTokens': usage.inputTextTokens,
        'openaiUsage.inputAudioTokens': usage.inputAudioTokens,
        'openaiUsage.outputTextTokens': usage.outputTextTokens,
        'openaiUsage.outputAudioTokens': usage.outputAudioTokens,
        'openaiUsage.responseCount': 1,
      },
    }).catch((err) => console.error('[VoiceStream] Error guardando uso de OpenAI:', err))
  }

  session.on('audio', (payload) => {
    if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) return
    isAgentSpeaking = true
    if (currentResponseAudioStartAt === null) currentResponseAudioStartAt = Date.now()
    const chunkMs = Buffer.from(payload, 'base64').length / BYTES_PER_MS
    currentResponseAudioMs += chunkMs
    // Encola este chunk detrás de lo que ya estaba pendiente (o a partir de ahora, si la
    // cola ya se había vaciado) — ver comentario de queueDrainCompleteAt arriba.
    queueDrainCompleteAt = Math.max(Date.now(), queueDrainCompleteAt) + chunkMs
    twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
  })

  // Con create_response:true, el propio servidor de OpenAI decide cuándo el cliente
  // empezó a hablar de verdad y cancela su respuesta en curso solo (responseDone llega
  // con status:"cancelled") — no hay que pedirle cancelar nosotros también, eso es lo
  // que causaba el error "no active response found" (cancelación duplicada).
  session.on('speechStarted', () => {
    isAgentSpeaking = false
    currentUserSpeechStartAt = Date.now()
  })

  session.on('responseCreated', (responseId) => {
    responseActive = true
    currentResponseAudioStartAt = null
    currentResponseAudioMs = 0
    if (awaitingHangupResponseCreation) {
      hangupAfterResponseId = responseId
      awaitingHangupResponseCreation = false
    }
  })

  // Piden un turno de seguimiento normal (no despedida) desde handleFunctionCall. Si la
  // respuesta que traía la function call ya terminó (responseActive ya es false para
  // cuando los awaits de la función resolvieron), es seguro pedirlo ya mismo — si no,
  // se difiere a responseDone vía pendingResponseCreate para no chocar con la API.
  function requestFollowUpResponse(): void {
    if (responseActive) {
      pendingResponseCreate = true
    } else {
      session.createResponse()
    }
  }

  // Mismo patrón que requestFollowUpResponse(), pero para la despedida — que además debe
  // esperar hasta el 'mark' de Twilio de ESA respuesta antes de colgar (hangupAfterResponseId).
  function requestFarewellResponse(): void {
    hangupFarewellSpoken = false
    if (responseActive) {
      pendingFarewellTrigger = true
    } else {
      awaitingHangupResponseCreation = true
      session.createResponse()
    }
  }

  session.on('responseDone', (status, responseId, usage) => {
    isAgentSpeaking = false
    responseActive = false
    if (status === 'cancelled' && streamSid && twilioWs.readyState === WebSocket.OPEN) {
      // Corta el audio ya en el buffer de Twilio para que no siga sonando la frase
      // que el servidor ya decidió cortar.
      twilioWs.send(JSON.stringify({ event: 'clear', streamSid }))
      // Ese audio descartado ya no cuenta como "por reproducir" — el 'clear' de arriba
      // vació la cola real de Twilio, así que el modelo de backlog debe reflejar eso.
      queueDrainCompleteAt = Date.now()
      // El audio de esta respuesta se descartó a medias — su transcript ya no aplica
      // (ni es seguro para la red de seguridad de abajo, ni corresponde a audio real
      // que Twilio vaya a reproducir completo).
      lastAgentTranscript = null
    }
    if (usage) persistOpenAIUsage(usage)

    // Guardado del turno del agente (movido aquí desde 'agentTranscript' — ver comentario
    // ahí) + red de seguridad de looksLikeHangupIntent(): el modelo a veces DICE que va a
    // colgar (frases tipo "voy a finalizar la llamada") sin llamar realmente a
    // finalizar_llamada/requerir_humano. Antes esto se evaluaba en 'agentTranscript'
    // (response.output_audio_transcript.done), pero ese evento NO garantiza que ya se
    // haya emitido el último chunk de audio de la respuesta — transcript y audio se
    // generan en paralelo, no en lockstep — y eso volvió a cortar la despedida a media
    // frase. response.done sí es terminal: solo llega cuando YA se generó (y por lo tanto
    // ya se mandó a Twilio vía el handler de 'audio') todo el audio de esta respuesta, así
    // que es el único punto seguro para decidir esto Y para saber la duración real del
    // audio (durationMs).
    if (status === 'completed' && lastAgentTranscript && callDocId) {
      const text = lastAgentTranscript
      const messageStartAt = currentResponseAudioStartAt ?? Date.now()
      const latencyMs = lastTurnEndAt !== null ? Math.max(0, Math.round(messageStartAt - lastTurnEndAt)) : null
      const durationMs = currentResponseAudioMs > 0 ? Math.round(currentResponseAudioMs) : null
      const elapsedMs = callStartAt !== null ? Math.max(0, Math.round(messageStartAt - callStartAt)) : null

      const triggeredBySafetyNet = !shouldHangup && looksLikeHangupIntent(text)
      if (triggeredBySafetyNet) shouldHangup = true

      Call.findByIdAndUpdate(callDocId, {
        ...(triggeredBySafetyNet ? { status: 'completed' } : {}),
        $push: {
          transcript: { role: 'assistant', content: text, timestamp: new Date(), elapsedMs, latencyMs, durationMs },
        },
      }).catch((err) => console.error('[VoiceStream] Error guardando transcript del agente:', err))

      lastTurnEndAt = messageStartAt + (currentResponseAudioMs > 0 ? currentResponseAudioMs : 0)
    }
    lastAgentTranscript = null

    // Turno de seguimiento genérico pedido por handleFunctionCall (ver declaración de
    // pendingResponseCreate) — solo si la respuesta terminó de verdad; si el cliente
    // interrumpió (status 'cancelled'), el propio servidor de OpenAI ya se encarga de
    // generar la siguiente respuesta por su cuenta (create_response:true).
    if (pendingResponseCreate) {
      pendingResponseCreate = false
      if (status === 'completed') session.createResponse()
    }

    // La respuesta que contenía la llamada a requerir_humano/finalizar_llamada ya
    // terminó de verdad (generación Y sin quedar cancelada) — es seguro pedir ahora
    // la respuesta de despedida sin chocar con la API.
    if (pendingFarewellTrigger) {
      pendingFarewellTrigger = false
      awaitingHangupResponseCreation = true
      session.createResponse()
    }

    if (!shouldHangup) return
    if (awaitingHangupResponseCreation) return // aún no arrancó la respuesta que esperamos
    if (hangupAfterResponseId && responseId !== hangupAfterResponseId) return // es de otra respuesta

    if (!hangupAfterResponseId) {
      // No se disparó ninguna respuesta extra de despedida — comportamiento base.
      hangupAfterPlayback()
      return
    }

    if (!hangupFarewellSpoken && hangupRetries < MAX_HANGUP_RETRIES) {
      // La respuesta que se suponía iba a traer la despedida salió vacía (el modelo solo
      // volvió a llamar una función sin decir nada) — le damos otra oportunidad antes de
      // colgar en silencio.
      hangupRetries++
      hangupAfterResponseId = null
      awaitingHangupResponseCreation = true
      session.createResponse()
      return
    }

    hangupAfterPlayback()
  })

  session.on('userTranscript', (text) => {
    if (!text || !callDocId) return
    // currentUserSpeechStartAt viene de 'speechStarted' (cuándo empezó a hablar el
    // cliente) — la diferencia contra lastTurnEndAt (cuándo terminó el turno anterior,
    // de la IA) es "cuánto tardó el cliente en contestar".
    const messageStartAt = currentUserSpeechStartAt ?? Date.now()
    const latencyMs = lastTurnEndAt !== null ? Math.max(0, Math.round(messageStartAt - lastTurnEndAt)) : null
    const elapsedMs = callStartAt !== null ? Math.max(0, Math.round(messageStartAt - callStartAt)) : null
    currentUserSpeechStartAt = null
    lastTurnEndAt = Date.now() // el cliente ya terminó de hablar (transcript ya cerrado)

    Call.findByIdAndUpdate(callDocId, {
      $push: { transcript: { role: 'user', content: text, timestamp: new Date(), elapsedMs, latencyMs } },
    }).catch((err) => console.error('[VoiceStream] Error guardando transcript de usuario:', err))
  })

  session.on('agentTranscript', (text) => {
    if (!text || !callDocId) return
    hangupFarewellSpoken = true
    lastAgentTranscript = text
    console.log(`[VoiceStream] agente dijo: "${text}"`)

    // Señal directa de que era buzón de voz, no una persona real — el propio texto que
    // el prompt instruye decir en esa rama (ver voiceConversation.service.ts). Mucho más
    // confiable que inferirlo contando renglones del transcript: el saludo grabado del
    // buzón se transcribe como "user" y hacía que se contara como conversación real
    // (bug confirmado en producción — el ciclo automático se detenía como si hubiera
    // contestado una persona, en vez de reintentar).
    if (text.toLowerCase().includes('le devolvemos la llamada')) {
      Call.findByIdAndUpdate(callDocId, { detectedVoicemail: true }).catch((err) =>
        console.error('[VoiceStream] Error marcando detectedVoicemail:', err)
      )
    }
    // El guardado a Mongo (con latencyMs/durationMs) se hace en 'responseDone', no aquí —
    // recién ahí se sabe la duración real del audio, y por la misma razón de orden de
    // eventos ya documentada más abajo (transcript.done no garantiza audio completo).
  })

  session.on('functionCall', (fnCall) => {
    handleFunctionCall(fnCall).catch((err) => {
      console.error('[VoiceStream] Error procesando llamada a función:', err)
    })
  })

  session.on('close', () => closeAll())

  async function handleFunctionCall({ name, callId, arguments: argsRaw }: RealtimeFunctionCall): Promise<void> {
    if (!callDocId) return
    console.log(`[VoiceStream] función llamada: ${name}(${argsRaw})`)

    let args: Record<string, any> = {}
    try {
      args = argsRaw ? JSON.parse(argsRaw) : {}
    } catch {
      args = {}
    }

    const call = await Call.findById(callDocId)
    if (!call) return

    // Registro de qué tool se llamó, independiente del resultado de cada case —
    // se usa al terminar la llamada para derivar `disposition` (ver voice.controller.ts).
    // functionCallLog es el detalle con elapsedMs para mostrar en el modal EN QUÉ
    // MOMENTO del flujo se disparó (calledFunctions se deja intacto, solo strings, porque
    // computeVoiceDisposition depende de ese formato).
    const functionElapsedMs = callStartAt !== null ? Math.max(0, Math.round(Date.now() - callStartAt)) : 0
    await Call.findByIdAndUpdate(callDocId, {
      $push: {
        calledFunctions: name,
        functionCallLog: { name, timestamp: new Date(), elapsedMs: functionElapsedMs },
      },
    })

    switch (name) {
      case 'confirmar_identidad': {
        call.identityConfirmed = true
        await call.save()
        session.sendFunctionCallOutput(callId, { ok: true })
        requestFollowUpResponse()
        break
      }

      case 'marcar_ticket_aclaracion': {
        await runAction('crm', 'create_clarification_ticket', {}, call)
        session.sendFunctionCallOutput(callId, { ok: true })
        requestFollowUpResponse()
        break
      }

      case 'marcar_factura_no_recibida': {
        await runAction('crm', 'mark_invoice_not_received', {}, call)
        session.sendFunctionCallOutput(callId, { ok: true })
        requestFollowUpResponse()
        break
      }

      case 'marcar_pago_domiciliado': {
        await runAction('crm', 'mark_domiciliado', {}, call)
        session.sendFunctionCallOutput(callId, { ok: true })
        requestFollowUpResponse()
        break
      }

      case 'registrar_promesa_pago': {
        const ctx = { amount: args.monto, payment_date: args.fecha }
        await runAction('crm', 'create_payment_commitment', ctx, call)
        await runAction('crm', 'schedule_reminder', ctx, call)
        session.sendFunctionCallOutput(callId, { ok: true })
        requestFollowUpResponse()
        break
      }

      case 'verificar_rfc': {
        // Comparación exacta hecha en el backend, no por criterio del modelo — a diferencia
        // del nombre (donde toleramos variaciones), un RFC parcial sí debe coincidir exacto.
        const clientForRfc = call.clientId ? await Client.findById(call.clientId).lean() : null
        const expected = clientForRfc?.rfc ? normalizeRFC(clientForRfc.rfc as string).slice(-4) : null
        const received = normalizeRFC(String(args.ultimos4 ?? ''))
        const matches = Boolean(expected) && received === expected
        session.sendFunctionCallOutput(callId, { matches })
        requestFollowUpResponse()
        return
      }

      case 'marcar_saldo_pagado': {
        // Corre en nuestro backend, no dentro del modelo — le regresamos el resultado
        // como salida de la función para que reaccione de forma natural en su siguiente turno.
        const result = await runAction('payments', 'verify_payment', {}, call)
        const exists = Boolean(result?.payment_exists)
        session.sendFunctionCallOutput(callId, { payment_exists: exists })
        requestFollowUpResponse()
        return
      }

      case 'requerir_humano': {
        call.requiresHuman = true
        call.status = 'requires_human'
        await call.save()
        if (call.clientId) {
          const motivo = typeof args.motivo === 'string' && args.motivo.trim() ? args.motivo.trim() : null
          await Client.findByIdAndUpdate(call.clientId, { requiresHuman: true, requiresHumanReason: motivo })
        }
        shouldHangup = true
        session.sendFunctionCallOutput(callId, { ok: true })
        requestFarewellResponse()
        break
      }

      case 'finalizar_llamada': {
        call.status = 'completed'
        await call.save()
        shouldHangup = true
        session.sendFunctionCallOutput(callId, { ok: true })
        requestFarewellResponse()
        break
      }

      case 'marcar_extension': {
        // Es un conmutador, no una persona — no hay nada más que hablar. Se cuelga sin
        // despedida y de inmediato se vuelve a marcar, esta vez con la extensión ya
        // integrada en el número (ver placeOutboundCall en voice.controller.ts, que
        // detecta Client.knownExtension y arma el "número,,,,ext#" para Twilio).
        const extension = typeof args.extension === 'string' && args.extension.trim() ? args.extension.trim() : '1001'
        const clientBefore = call.clientId ? await Client.findById(call.clientId).lean() : null
        const alreadyHadExtension = Boolean(clientBefore?.knownExtension)

        if (call.clientId) {
          await Client.findByIdAndUpdate(call.clientId, { knownExtension: extension })
        }

        session.sendFunctionCallOutput(callId, { ok: true })
        shouldHangup = true
        hangupFarewellSpoken = true

        // Si esta llamada YA iba con una extensión pre-cargada (Client.knownExtension ya
        // tenía valor) y de todos modos volvió a sonar a conmutador, no reintentamos en
        // automático — evita un ciclo de remarcado infinito si la extensión guardada ya
        // no es la correcta. Se deja para revisión manual.
        if (call.clientId && !alreadyHadExtension) {
          const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
          if (publicUrl) {
            placeOutboundCall(String(call.clientId), publicUrl, 'manual').catch((err) =>
              console.error('[VoiceStream] Error re-marcando con extensión:', err)
            )
          }
        }
        break
      }

      default:
        session.sendFunctionCallOutput(callId, { ok: false, error: 'unknown_function' })
        requestFollowUpResponse()
        break
    }
  }

  async function initialize(callSid: string): Promise<void> {
    const call = await Call.findOne({ callSid })
    if (!call) {
      console.error(`[VoiceStream] No se encontró Call para callSid=${callSid}`)
      closeAll()
      return
    }
    callDocId = call._id as mongoose.Types.ObjectId

    const client = call.clientId ? await Client.findById(call.clientId).lean() : null
    // Si falla la consulta de facturas, la llamada sigue igual (el prompt cae a agingDays).
    const invoices = client ? await loadInvoiceSummary(client._id).catch(() => null) : null
    const clientInfo: ClientInfo | null = client
      ? {
          name: client.name as string,
          debt: (client.debt as number) ?? 0,
          agingDays: (client.agingDays as number) ?? 0,
          status: client.status as string,
          rfc: (client.rfc as string) ?? null,
          contact: (client.contact as string) ?? null,
          invoices,
        }
      : null

    const systemPrompt = buildVoiceSystemPrompt(clientInfo, call.phone)
    const transcriptionPrompt = buildTranscriptionPrompt(clientInfo)

    try {
      await session.connect(systemPrompt, transcriptionPrompt)
    } catch (err) {
      console.error('[VoiceStream] No se pudo conectar a OpenAI Realtime:', err)
      closeAll()
      return
    }

    if (closed) return

    ready = true
    for (const payload of pendingAudio.splice(0)) session.appendAudio(payload)

    // El agente habla primero al contestar, no espera a que el cliente diga algo.
    session.triggerGreeting()
  }

  twilioWs.on('message', (raw: WebSocket.RawData) => {
    let event: any
    try {
      event = JSON.parse(raw.toString())
    } catch {
      return
    }

    switch (event.event) {
      case 'start': {
        streamSid = event.start?.streamSid ?? null
        const callSid = event.start?.callSid ?? null
        console.log(`[VoiceStream] Stream iniciado streamSid=${streamSid} callSid=${callSid}`)
        // Ancla de todos los "elapsedMs"/"latencyMs" del flujo (ver declaración arriba).
        callStartAt = Date.now()
        lastTurnEndAt = callStartAt

        if (!callSid) {
          console.error('[VoiceStream] Evento start sin callSid, cerrando')
          closeAll()
          break
        }

        initialize(callSid).catch((err) => {
          console.error('[VoiceStream] Error inicializando sesión:', err)
          closeAll()
        })
        break
      }

      case 'media':
        if (event.media?.payload) {
          if (ready) session.appendAudio(event.media.payload)
          else pendingAudio.push(event.media.payload)
        }
        break

      case 'mark':
        // Twilio confirma que ya reprodujo todo el audio encolado antes de este mark —
        // si es el mark de despedida que estábamos esperando, ahora sí es seguro colgar.
        if (pendingHangupMark && event.mark?.name === pendingHangupMark) {
          pendingHangupMark = null
          closeAll()
        }
        break

      case 'stop':
        console.log('[VoiceStream] Stream detenido')
        closeAll()
        break

      default:
        break
    }
  })

  twilioWs.on('close', () => closeAll())
  twilioWs.on('error', (err) => {
    console.error('[VoiceStream] Error en WebSocket de Twilio:', err)
    closeAll()
  })
}
