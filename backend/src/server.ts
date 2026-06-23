import "dotenv/config"
import express from "express"
import cors from "cors"
import http from "http"
import { WebSocketServer } from "ws"

import whatsappRoutes from "./routes/whatsapp"
import clientRoutes from "./routes/clients"
import messageRoutes from "./routes/messages"
import metricsRoutes from "./routes/metrics"
import conversationRoutes from "./routes/conversations"
import voiceRoutes from "./routes/voice.routes"
import { connectDB } from "./db"
import { handleMediaStream } from "./services/claudeVoice.service"
import { validateTwilioConfig } from "./config/twilio"

const app = express()

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: false })) // required for Twilio webhooks

app.get("/", (_, res) => res.send("CobranzaAI API OK"))

app.use("/api", whatsappRoutes)
app.use("/api", clientRoutes)
app.use("/api", messageRoutes)
app.use("/api", metricsRoutes)
app.use("/api", conversationRoutes)
app.use("/api", voiceRoutes)

async function start() {
  await connectDB()
  validateTwilioConfig()

  const PORT = Number(process.env.PORT) || 3002
  const server = http.createServer(app)

  // WebSocket for Twilio Media Streams (real-time audio - future upgrade)
  const wss = new WebSocketServer({ server, path: "/api/voice/stream" })
  wss.on("connection", (ws) => {
    console.log("[Voice] Media Stream WebSocket conectado")
    handleMediaStream(ws)
  })

  server.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`)
    console.log(`WebSocket disponible en ws://localhost:${PORT}/api/voice/stream`)
  })
}

start()
