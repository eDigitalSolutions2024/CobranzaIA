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

    // Estado del guion automatizado de WhatsApp (ver whatsappFlow.service.ts)
    flowState: {
      type: String,
      enum: ["identity", "invoice_check", "payment_date", "confirming", "closed"],
      default: null,
    },

    flowContext: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    flowOutcome: {
      type: {
        type: String,
        enum: [
          "payment_promise",
          "reported_payment",
          "domiciliado",
          "dispute",
          "wrong_contact",
          "resend_invoice",
          "callback_later",
          "no_payment_capacity",
          "pending_human",
        ],
        default: null,
      },
      amount: { type: Number, default: null },
      date: { type: Date, default: null },
      notes: { type: String, default: null },
      updatedAt: { type: Date, default: null },
    },

    requiresFollowUp: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

ConversationSchema.index({ lastMessageAt: -1 })

export default mongoose.model("Conversation", ConversationSchema)
