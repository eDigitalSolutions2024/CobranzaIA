import "dotenv/config"
import express from "express"
import cors from "cors"
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
import { connectDB } from "./db"
import { handleMediaStream } from "./controllers/voiceStream.controller"
import { validateTwilioConfig } from "./config/twilio"
import { validateOpenAIConfig } from "./config/openai"
import { startReminderScheduler } from "./services/reminderScheduler.service"
import { startPhoneFallbackScheduler } from "./services/phoneFallback.service"

const app = express()

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

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error("Falta JWT_SECRET en el .env. El servidor no puede iniciar sin él.")
    process.exit(1)
  }

  await connectDB()
  validateTwilioConfig()
  validateOpenAIConfig()
  startReminderScheduler()
  startPhoneFallbackScheduler()

  const PORT = Number(process.env.PORT) || 3003
  const server = http.createServer(app)

  // Puente de audio en tiempo real Twilio <-> OpenAI Realtime API
  const wss = new WebSocketServer({ server, path: "/api/voice/stream" })
  wss.on("connection", (ws, req) => {
    console.log("[Voice] Media Stream WebSocket conectado")
    handleMediaStream(ws, req).catch((err) => console.error("[Voice] Error en handleMediaStream:", err))
  })

  server.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`)
    console.log(`WebSocket disponible en ws://localhost:${PORT}/api/voice/stream`)
  })
}

start()
