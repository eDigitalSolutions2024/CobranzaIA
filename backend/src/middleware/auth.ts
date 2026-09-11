import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import User from "../models/User"

export interface AuthUser {
  id: string
  email: string
}

export interface AuthedRequest extends Request {
  user?: AuthUser
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: "No autenticado" })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string
      email: string
      tokenVersion?: number
    }

    // Compara contra la versión actual en BD — permite invalidar tokens ya
    // emitidos antes de que expiren solos (ver authController.logoutAll).
    const user = await User.findById(payload.id).select("tokenVersion").lean()
    if (!user || (payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: "Sesión inválida o expirada" })
    }

    req.user = { id: payload.id, email: payload.email }
    next()
  } catch {
    return res.status(401).json({ message: "Sesión inválida o expirada" })
  }
}
