import "dotenv/config"
import express from "express"
import cors from "cors"

import whatsappRoutes from "./routes/whatsapp"
import clientRoutes from "./routes/clients"
import messageRoutes from "./routes/messages"
import metricsRoutes from "./routes/metrics"
import conversationRoutes from "./routes/conversations"
import { connectDB } from "./db"

const app = express()

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
)

app.use(express.json())

app.get("/", (_, res) => res.send("CobranzaAI API OK"))

app.use("/api", whatsappRoutes)
app.use("/api", clientRoutes)
app.use("/api", messageRoutes)
app.use("/api", metricsRoutes)
app.use("/api", conversationRoutes)

async function start() {
  await connectDB()

  const PORT = Number(process.env.PORT) || 3002

  app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`)
  })
}

start()
