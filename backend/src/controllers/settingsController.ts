import { Response } from "express"
import bcrypt from "bcryptjs"
import ExchangeRate from "../models/ExchangeRate"
import User from "../models/User"
import { AuthedRequest } from "../middleware/auth"

// Sin ningún registro todavía (primer arranque), se usa este valor de partida.
const DEFAULT_USD_MXN = 17.5

export async function getExchangeRate(req: AuthedRequest, res: Response) {
  try {
    let rate = await ExchangeRate.findOne().sort({ createdAt: -1 })
    if (!rate) {
      rate = await ExchangeRate.create({ usdMxn: DEFAULT_USD_MXN })
    }
    res.json({ usdMxn: rate.usdMxn, updatedAt: rate.updatedAt })
  } catch (error) {
    console.error("Error getExchangeRate:", error)
    res.status(500).json({ message: "Error obteniendo el tipo de cambio" })
  }
}

export async function updateExchangeRate(req: AuthedRequest, res: Response) {
  try {
    const { usdMxn, password } = req.body as { usdMxn?: number; password?: string }

    if (!usdMxn || !Number.isFinite(usdMxn) || usdMxn <= 0) {
      return res.status(400).json({ message: "Tipo de cambio inválido" })
    }
    if (!password) {
      return res.status(400).json({ message: "Se requiere la contraseña para confirmar" })
    }

    const user = await User.findById(req.user?.id)
    if (!user) return res.status(401).json({ message: "No autenticado" })

    const valid = await bcrypt.compare(password, user.passwordHash)
    // 403, no 401: un 401 en el frontend cierra la sesión automáticamente (ver services/api.ts),
    // y una contraseña incorrecta aquí es un rechazo de autorización, no una sesión vencida.
    if (!valid) return res.status(403).json({ message: "Contraseña incorrecta" })

    let rate = await ExchangeRate.findOne().sort({ createdAt: -1 })
    if (!rate) rate = new ExchangeRate({})

    rate.usdMxn = usdMxn
    rate.updatedBy = user._id as any
    await rate.save()

    res.json({ usdMxn: rate.usdMxn, updatedAt: rate.updatedAt })
  } catch (error) {
    console.error("Error updateExchangeRate:", error)
    res.status(500).json({ message: "Error actualizando el tipo de cambio" })
  }
}
