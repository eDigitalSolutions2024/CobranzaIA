import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

export interface AuthUser {
  id: string
  email: string
}

export interface AuthedRequest extends Request {
  user?: AuthUser
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: "No autenticado" })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string
      email: string
    }
    req.user = { id: payload.id, email: payload.email }
    next()
  } catch {
    return res.status(401).json({ message: "Sesión inválida o expirada" })
  }
}
