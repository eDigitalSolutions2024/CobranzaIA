import mongoose, { Schema, Document } from "mongoose"

export interface IAuditLog extends Document {
  event: "login_success" | "login_failed" | "logout_all"
  email: string
  userId?: mongoose.Types.ObjectId | null
  ip: string
  userAgent?: string | null
  reason?: string | null
  createdAt: Date
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    event: {
      type: String,
      enum: ["login_success", "login_failed", "logout_all"],
      required: true,
    },
    email: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    ip: { type: String, required: true },
    userAgent: { type: String, default: null },
    // Motivo en fallos ("invalid_credentials", "rate_limited") — null en éxitos.
    reason: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

AuditLogSchema.index({ createdAt: -1 })
AuditLogSchema.index({ email: 1, createdAt: -1 })

export default mongoose.model<IAuditLog>("AuditLog", AuditLogSchema)
