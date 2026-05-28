import mongoose from "mongoose"

const ConversationSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    lastMessage: {
      type: String,
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: null,
    },

    lastDirection: {
      type: String,
      enum: ["inbound", "outbound"],
      default: "outbound",
    },

    // active         = conversación abierta
    // awaiting_client  = esperamos respuesta del cliente
    // awaiting_agent   = cliente respondió, esperamos acción del agente
    // closed         = conversación cerrada
    status: {
      type: String,
      enum: ["active", "awaiting_client", "awaiting_agent", "closed"],
      default: "active",
    },

    unreadCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

ConversationSchema.index({ phone: 1 }, { unique: true })
ConversationSchema.index({ lastMessageAt: -1 })

export default mongoose.model("Conversation", ConversationSchema)
