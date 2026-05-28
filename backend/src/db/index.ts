import mongoose from "mongoose"

export async function connectDB() {
  try {
    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/cobranza-ai"
    await mongoose.connect(uri)
    console.log("MongoDB conectado:", uri)
  } catch (error) {
    console.log("Error conectando MongoDB:", error)
    process.exit(1)
  }
}
