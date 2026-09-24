// Streaming de texto a voz con ElevenLabs (piloto de voz, ver
// C:\Users\test\.claude\plans\toasty-riding-floyd.md).
//
// ElevenLabs abre una conexión WebSocket por cada generación. Para bajar latencia:
//  - Se mantiene UNA conexión "tibia" ya abierta y lista (handshake TLS + auth hechos)
//    para el siguiente turno, en vez de abrirla hasta que Claude termina de responder.
//  - El texto se manda por pedazos (frase por frase) conforme Claude lo va generando, así
//    la voz arranca con la primera frase sin esperar el resto de la respuesta.
import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { ELEVENLABS_API_KEY, ELEVENLABS_MODEL, ELEVENLABS_VOICE_ID } from '../config/voicePipeline'

export interface ElevenLabsSessionEvents {
  audio: (base64Payload: string, contextId: string) => void
  done: (contextId: string) => void
  error: (err: Error) => void
  close: () => void
}

export declare interface ElevenLabsTtsSession {
  on<E extends keyof ElevenLabsSessionEvents>(event: E, listener: ElevenLabsSessionEvents[E]): this
  emit<E extends keyof ElevenLabsSessionEvents>(event: E, ...args: Parameters<ElevenLabsSessionEvents[E]>): boolean
}

interface TtsSocket {
  ws: WebSocket
  open: boolean
  pending: string[]
  contextId: string | null
  audioChunks: number
  discarded: boolean
}

export class ElevenLabsTtsSession extends EventEmitter {
  private active = new Map<string, TtsSocket>()
  private warm: TtsSocket | null = null
  private closed = false
  private warmAt = 0
  private recycleTimer: NodeJS.Timeout | null = null

  // Una conexión de ElevenLabs que espera varios segundos antes de recibir texto genera
  // audio con silencios de 1.5s+ metidos a media frase (medido: la misma frase de 3.9s
  // salió de 9.3s con la conexión tibia esperando 12s; con 6s salió limpia). Por eso la
  // tibia se renueva cada pocos segundos — cuesta solo un handshake, sin consumir créditos.
  private static readonly WARM_MAX_AGE_MS = 3500

  async connect(): Promise<void> {
    this.openWarm()
    this.recycleTimer = setInterval(() => {
      if (!this.closed && this.warm && Date.now() - this.warmAt > ElevenLabsTtsSession.WARM_MAX_AGE_MS) this.openWarm()
    }, 1000)
  }

  private openWarm(): void {
    const old = this.warm
    this.warm = this.openSocket()
    this.warmAt = Date.now()
    if (old && !old.contextId) {
      old.discarded = true
      old.ws.terminate()
    }
  }

  private openSocket(): TtsSocket {
    // inactivity_timeout: por defecto ElevenLabs cierra la conexión a los 20s sin texto —
    // la tibia puede esperar todo un turno del cliente hablando.
    // language_code=es: sin esto, eleven_flash_v2_5 detecta el idioma POR CADA PEDAZO de
    // texto que se manda por separado (ver takeSpeakableChunk en
    // voiceStreamCartesia.controller.ts, que trocea la respuesta de Claude en frases/
    // cláusulas cortas para bajar latencia) — un fragmento corto o ambiguo (ej. "HP
    // Financial Services", que es texto en inglés dentro del guion en español) puede
    // hacer que ese pedazo se lea con acento/idioma equivocado, sonando como si el agente
    // "cambiara de idioma" a media llamada. Con language_code fijo, cada pedazo se lee en
    // español sin importar qué tan corto o ambiguo sea.
    const url =
      `wss://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream-input` +
      `?model_id=${ELEVENLABS_MODEL}&language_code=es&output_format=ulaw_8000&inactivity_timeout=120`
    const sock: TtsSocket = { ws: new WebSocket(url), open: false, pending: [], contextId: null, audioChunks: 0, discarded: false }
    const { ws } = sock

    ws.on('unexpected-response', (_req, res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk.toString()))
      res.on('end', () => {
        this.emit('error', new Error(`ElevenLabs rechazó la conexión: HTTP ${res.statusCode} — ${body.slice(0, 300)}`))
        this.forget(sock)
      })
    })

    ws.on('open', () => {
      sock.open = true
      ws.send(JSON.stringify({
        text: ' ',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        xi_api_key: ELEVENLABS_API_KEY,
      }))
      for (const msg of sock.pending.splice(0)) ws.send(msg)
    })

    ws.on('message', (raw) => {
      let event: any
      try {
        event = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (event.error || event.message) console.error('[ElevenLabs] Mensaje del servidor:', JSON.stringify(event).slice(0, 300))
      if (event.audio && sock.contextId) {
        sock.audioChunks++
        this.emit('audio', String(event.audio), sock.contextId)
      }
      if (event.isFinal && sock.contextId) {
        console.log(`[ElevenLabs] Turno completo, ${sock.audioChunks} chunks de audio`)
        this.emit('done', sock.contextId)
        ws.close()
        this.forget(sock)
      }
    })

    ws.on('error', (err) => {
      if (sock.discarded) return
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
      this.forget(sock)
    })

    ws.on('close', (code, reason) => {
      if (sock.discarded) return
      console.log(`[ElevenLabs] WebSocket cerrado code=${code} reason=${reason?.toString() ?? ''} turno=${sock.contextId ? 'sí' : 'tibio'}`)
      this.forget(sock)
    })

    return sock
  }

  private forget(sock: TtsSocket): void {
    if (this.warm === sock) this.warm = null
    if (sock.contextId) this.active.delete(sock.contextId)
  }

  private send(sock: TtsSocket, payload: object): void {
    const msg = JSON.stringify(payload)
    if (sock.open && sock.ws.readyState === WebSocket.OPEN) sock.ws.send(msg)
    else sock.pending.push(msg)
  }

  // Empieza un turno hablado: toma la conexión tibia (o abre una si no había) y deja
  // otra tibia lista para el siguiente turno. Regresa el contextId para mandar texto.
  beginTurn(): string {
    if (this.closed) return ''
    const reusable = !!this.warm && this.warm.ws.readyState <= WebSocket.OPEN
    const sock = reusable ? this.warm! : this.openSocket()
    console.log(`[ElevenLabs] beginTurn: tibio reutilizable=${reusable} abierto=${sock.open} edad=${reusable ? Date.now() - this.warmAt : 0}ms`)
    const contextId = randomUUID()
    sock.contextId = contextId
    this.active.set(contextId, sock)
    this.openWarm()
    return contextId
  }

  // flush: true fuerza a ElevenLabs a generar ya el audio de lo acumulado (fin de frase),
  // en vez de esperar a juntar más texto.
  sendText(contextId: string, text: string, flush = false): void {
    const sock = this.active.get(contextId)
    if (!sock || !text) return
    const clean = text.trimStart()
    if (!clean) return
    this.send(sock, { text: clean.endsWith(' ') ? clean : `${clean} `, flush })
  }

  // Texto vacío = "no hay más texto en este turno" — ElevenLabs termina de generar y
  // responde con isFinal.
  endTurn(contextId: string): void {
    const sock = this.active.get(contextId)
    if (!sock) return
    this.send(sock, { text: '' })
  }

  // Barge-in: cierra de inmediato la conexión de ese turno.
  cancel(contextId: string): void {
    const sock = this.active.get(contextId)
    if (sock) {
      sock.ws.close()
      this.forget(sock)
    }
  }

  close(): void {
    this.closed = true
    if (this.recycleTimer) clearInterval(this.recycleTimer)
    for (const sock of this.active.values()) sock.ws.close()
    this.active.clear()
    this.warm?.ws.close()
    this.warm = null
  }
}
