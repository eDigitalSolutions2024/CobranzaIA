import { Response } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User from "../models/User"
import { AuthedRequest } from "../middleware/auth"

const TOKEN_TTL = "7d"

export async function login(req: AuthedRequest, res: Response) {
  try {
    const { email, password } = req.body as { email?: string; password?: string }

    if (!email || !password) {
      return res.status(400).json({ message: "Email y contraseña son obligatorios" })
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ message: "Credenciales inválidas" })
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: TOKEN_TTL }
    )

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (error) {
    console.error("Error login:", error)
    res.status(500).json({ message: "Error iniciando sesión" })
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
