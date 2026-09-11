import { Request, Response } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User from "../models/User"
import AuditLog from "../models/AuditLog"
import { AuthedRequest } from "../middleware/auth"

const TOKEN_TTL = "7d"

function logAccess(
  req: Request,
  event: "login_success" | "login_failed" | "logout_all",
  email: string,
  userId?: string | null,
  reason?: string | null
): void {
  AuditLog.create({
    event,
    email,
    userId: userId || null,
    ip: req.ip || "unknown",
    userAgent: req.headers["user-agent"] || null,
    reason: reason || null,
  }).catch((err) => console.error("Error guardando AuditLog:", err))
}

export async function login(req: AuthedRequest, res: Response) {
  try {
    const { email, password } = req.body as { email?: string; password?: string }

    if (!email || !password) {
      return res.status(400).json({ message: "Email y contraseña son obligatorios" })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail })
    if (!user) {
      logAccess(req, "login_failed", normalizedEmail, null, "user_not_found")
      return res.status(401).json({ message: "Credenciales inválidas" })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      logAccess(req, "login_failed", normalizedEmail, user._id.toString(), "invalid_password")
      return res.status(401).json({ message: "Credenciales inválidas" })
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, tokenVersion: user.tokenVersion ?? 0 },
      process.env.JWT_SECRET as string,
      { expiresIn: TOKEN_TTL }
    )

    logAccess(req, "login_success", normalizedEmail, user._id.toString())

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (error) {
    console.error("Error login:", error)
    res.status(500).json({ message: "Error iniciando sesión" })
  }
}

// Invalida de inmediato todos los tokens ya emitidos para este usuario (ej. si
// se sospecha que un token se filtró) — no hay que esperar a que expiren solos
// en 7 días. Sube tokenVersion; requireAuth rechaza cualquier JWT con una
// versión distinta a la actual.
export async function logoutAll(req: AuthedRequest, res: Response) {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: "No autenticado" })

    const user = await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }, { new: true })
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" })

    logAccess(req, "logout_all", user.email, user._id.toString())

    res.json({ message: "Todas las sesiones fueron cerradas" })
  } catch (error) {
    console.error("Error logoutAll:", error)
    res.status(500).json({ message: "Error cerrando sesiones" })
  }
}

export async function getAuditLog(req: AuthedRequest, res: Response) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean()
    res.json(logs)
  } catch (error) {
    console.error("Error getAuditLog:", error)
    res.status(500).json({ message: "Error obteniendo la auditoría de accesos" })
  }
}

export async function me(req: AuthedRequest, res: Response) {
  try {
    const user = await User.findById(req.user?.id).select("name email")
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" })
    res.json({ id: user._id, name: user.name, email: user.email })
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo el usuario" })
  }
}
