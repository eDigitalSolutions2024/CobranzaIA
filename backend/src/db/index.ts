import mongoose from 'mongoose'

export async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cobranza-ai'

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Desconectado — reconectando...')
  })
  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Error de conexión:', err)
  })

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 20,        // max concurrent connections (default 5)
      minPoolSize: 5,         // keep 5 warm — avoids cold connect latency
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
    })
    console.log('[MongoDB] Conectado:', uri)
  } catch (error) {
    console.error('[MongoDB] Error al conectar:', error)
    process.exit(1)
  }
}
