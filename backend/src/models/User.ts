import { Schema, model } from "mongoose"

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    // Se incluye en cada JWT emitido; requireAuth lo compara contra este valor.
    // Incrementarlo (ver authController.logoutAll) invalida de inmediato TODOS
    // los tokens ya emitidos para este usuario, sin esperar a que expiren solos.
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

export default model("User", UserSchema)
