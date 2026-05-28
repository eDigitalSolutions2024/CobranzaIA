import mongoose from "mongoose"

const messageSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },

    phone: {
      type: String,
      required: true,
    },

    debt: {
      type: Number,
      default: 0,
    },

    channel: {
      type: String,
      default: "WhatsApp",
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      default: "inbound",
    },

    message: {
      type: String,
      required: true,
    },

    intent: {
      type: String,
      default: "general",
    },

    status: {
      type: String,
      enum: ["prepared", "sent", "delivered", "read", "replied", "failed"],
      default: "prepared",
    },

    reply: {
      type: String,
      default: null,
    },

    attachments: {
      type: [String],
      default: [],
    },

    metaMessageId: {
      type: String,
      default: null,
    },

    metaResponse: {
      type: Object,
    },

    metaError: {
      type: Object,
      default: null,
    },

    aiProcessed: {
      type: Boolean,
      default: false,
    },

    score: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

messageSchema.index({ metaMessageId: 1 })
messageSchema.index({ phone: 1 })
messageSchema.index({ conversationId: 1 })
messageSchema.index({ createdAt: -1 })

export default mongoose.model("Message", messageSchema)
