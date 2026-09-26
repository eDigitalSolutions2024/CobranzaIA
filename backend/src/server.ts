import "dotenv/config"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import http from "http"
import { WebSocketServer } from "ws"

import authRoutes from "./routes/auth"
import whatsappRoutes from "./routes/whatsapp"
import clientRoutes from "./routes/clients"
import messageRoutes from "./routes/messages"
import metricsRoutes from "./routes/metrics"
import conversationRoutes from "./routes/conversations"
import voiceRoutes from "./routes/voice.routes"
import settingsRoutes from "./routes/settings"
import usageRoutes from "./routes/usage"
import blacklistRoutes from "./routes/blacklist"
import { connectDB } from "./db"
import { handleMediaStream } from "./controllers/voiceStream.controller"
import { handleMediaStreamCartesia } from "./controllers/voiceStreamCartesia.controller"
import { validateTwilioConfig } from "./config/twilio"
import { validateOpenAIConfig } from "./config/openai"
import { validateVoicePipelineConfig } from "./config/voicePipeline"
import { startReminderScheduler } from "./services/reminderScheduler.service"
import { startPhoneFallbackScheduler } from "./services/phoneFallback.service"
import { startAutoCallScheduler } from "./services/autoCallScheduler.service"
import { startCallReconciliationScheduler } from "./services/callReconciliation.service"

const app = express()

// En producción corre detrás de nginx (ver deploy) — sin esto, Express ve la IP
// del proxy para TODAS las peticiones en vez de la del cliente real, y cualquier
// rate limiting por IP (ver routes/auth.ts) terminaría bloqueando a todos los
// usuarios por igual en cuanto UNO fallara varias veces el login. "1" = confía
// solo en el primer hop (nginx), no en cualquier X-Forwarded-For que mande el
// cliente directamente.
app.set("trust proxy", 1)

// Cabeceras de seguridad HTTP estándar (X-Content-Type-Options, evita
// que el navegador exponga qué servidor corre, HSTS, etc.)
app.use(helmet())

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: false })) // required for Twilio webhooks

app.get("/", (_, res) => res.send("CobranzaAI API OK"))

app.use("/api", authRoutes)
app.use("/api", whatsappRoutes)
app.use("/api", clientRoutes)
app.use("/api", messageRoutes)
app.use("/api", metricsRoutes)
app.use("/api", conversationRoutes)
app.use("/api", voiceRoutes)
app.use("/api", settingsRoutes)
app.use("/api", usageRoutes)
app.use("/api", blacklistRoutes)

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error("Falta JWT_SECRET en el .env. El servidor no puede iniciar sin él.")
    process.exit(1)
  }

  await connectDB()
  validateTwilioConfig()
  validateOpenAIConfig()
  validateVoicePipelineConfig()
  // Desactivados a petición del usuario (2026-09-18) — de momento no se necesita que
  // manden la plantilla cobranza_recordatorio. Su única función era ese envío, así que
  // se detiene el scheduler completo en vez de solo quitar el mensaje. Descomentar para
  // reactivar (no requiere ningún otro cambio, el resto de su lógica sigue intacta).
  // startReminderScheduler()
  // startPhoneFallbackScheduler()
  startAutoCallScheduler()
  startCallReconciliationScheduler()

  const PORT = Number(process.env.PORT) || 3003
  const server = http.createServer(app)

  // Dos endpoints de WebSocket en el mismo servidor HTTP (Realtime de OpenAI y el
  // piloto Deepgram+ElevenLabs) — se usa el patrón recomendado por la propia librería
  // ws para varias rutas (noServer + enrutar el evento 'upgrade' a mano): con dos
  // WebSocketServer atados directo vía {server, path}, cada uno registra su propio
  // listener de 'upgrade' en el server y Twilio recibía 400 Bad Request al conectar al
  // segundo (confirmado en la primera prueba real de este piloto).
  const wss = new WebSocketServer({ noServer: true })
  wss.on("connection", (ws, req) => {
    console.log("[Voice] Media Stream WebSocket conectado")
    handleMediaStream(ws, req).catch((err) => console.error("[Voice] Error en handleMediaStream:", err))
  })

  const wssCartesia = new WebSocketServer({ noServer: true })
  wssCartesia.on("connection", (ws, req) => {
    console.log("[VoiceCartesia] Media Stream WebSocket conectado")
    handleMediaStreamCartesia(ws, req).catch((err) => console.error("[VoiceCartesia] Error en handleMediaStreamCartesia:", err))
  })

  server.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0]
    if (pathname === "/api/voice/stream") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req))
    } else if (pathname === "/api/voice/stream-cartesia") {
      wssCartesia.handleUpgrade(req, socket, head, (ws) => wssCartesia.emit("connection", ws, req))
    } else {
      socket.destroy()
    }
  })

  server.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`)
    console.log(`WebSocket disponible en ws://localhost:${PORT}/api/voice/stream`)
  })
}

start()
