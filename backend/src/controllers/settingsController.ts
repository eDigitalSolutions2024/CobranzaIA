import { Response } from "express"
import bcrypt from "bcryptjs"
import ExchangeRate from "../models/ExchangeRate"
import AutomationSettings from "../models/AutomationSettings"
import User from "../models/User"
import { AuthedRequest } from "../middleware/auth"

// Confirmación de contraseña compartida por los toggles sensibles de Settings (tipo de
// cambio, llamadas automáticas) — ambos pueden generar cargos/llamadas reales, así que
// piden lo mismo que ya se pedía para el tipo de cambio.
async function verifyPassword(req: AuthedRequest, password: string | undefined): Promise<
  { ok: true; userId: any } | { ok: false; status: number; message: string }
> {
  if (!password) return { ok: false, status: 400, message: "Se requiere la contraseña para confirmar" }
  const user = await User.findById(req.user?.id)
  if (!user) return { ok: false, status: 401, message: "No autenticado" }
  const valid = await bcrypt.compare(password, user.passwordHash)
  // 403, no 401: un 401 en el frontend cierra la sesión automáticamente (ver services/api.ts),
  // y una contraseña incorrecta aquí es un rechazo de autorización, no una sesión vencida.
  if (!valid) return { ok: false, status: 403, message: "Contraseña incorrecta" }
  return { ok: true, userId: user._id }
}

export async function listExchangeRates(req: AuthedRequest, res: Response) {
  try {
    const rates = await ExchangeRate.find().sort({ currencyCode: 1 }).lean()
    res.json(
      rates.map((r) => ({ currencyCode: r.currencyCode, rateToMxn: r.rateToMxn, updatedAt: r.updatedAt }))
    )
  } catch (error) {
    console.error("Error listExchangeRates:", error)
    res.status(500).json({ message: "Error obteniendo los tipos de cambio" })
  }
}

export async function upsertExchangeRate(req: AuthedRequest, res: Response) {
  try {
    const { currencyCode, rateToMxn, password } = req.body as {
      currencyCode?: string
      rateToMxn?: number
      password?: string
    }

    const code = String(currencyCode ?? "").trim().toUpperCase()
    if (!code || !/^[A-Z]{3}$/.test(code)) {
      return res.status(400).json({ message: "Código de moneda inválido (ej. USD, PEN, COP)" })
    }
    if (code === "MXN") {
      return res.status(400).json({ message: "MXN es la moneda base, no necesita tipo de cambio" })
    }
    if (!rateToMxn || !Number.isFinite(rateToMxn) || rateToMxn <= 0) {
      return res.status(400).json({ message: "Tipo de cambio inválido" })
    }

    const check = await verifyPassword(req, password)
    if (!check.ok) return res.status(check.status).json({ message: check.message })

    const rate = await ExchangeRate.findOneAndUpdate(
      { currencyCode: code },
      { rateToMxn, updatedBy: check.userId },
      { upsert: true, new: true }
    )

    res.json({ currencyCode: rate.currencyCode, rateToMxn: rate.rateToMxn, updatedAt: rate.updatedAt })
  } catch (error) {
    console.error("Error upsertExchangeRate:", error)
    res.status(500).json({ message: "Error actualizando el tipo de cambio" })
  }
}

export async function getAutomationSettings(req: AuthedRequest, res: Response) {
  try {
    const settings = await AutomationSettings.findById("global").lean()
    res.json({
      autoCallsEnabled: settings?.autoCallsEnabled ?? false,
      voiceEngine: settings?.voiceEngine ?? "openai",
    })
  } catch (error) {
    console.error("Error getAutomationSettings:", error)
    res.status(500).json({ message: "Error obteniendo la configuración de automatización" })
  }
}

// Acepta autoCallsEnabled y/o voiceEngine (al menos uno) — los dos piden contraseña
// porque cambian qué corre contra clientes reales con costo real.
export async function updateAutomationSettings(req: AuthedRequest, res: Response) {
  try {
    const { autoCallsEnabled, voiceEngine, password } = req.body as {
      autoCallsEnabled?: boolean
      voiceEngine?: string
      password?: string
    }
    if (autoCallsEnabled === undefined && voiceEngine === undefined) {
      return res.status(400).json({ message: "Se requiere autoCallsEnabled o voiceEngine" })
    }
    if (autoCallsEnabled !== undefined && typeof autoCallsEnabled !== "boolean") {
      return res.status(400).json({ message: "autoCallsEnabled debe ser true o false" })
    }
    if (voiceEngine !== undefined && voiceEngine !== "openai" && voiceEngine !== "elevenlabs") {
      return res.status(400).json({ message: "voiceEngine debe ser 'openai' o 'elevenlabs'" })
    }

    const check = await verifyPassword(req, password)
    if (!check.ok) return res.status(check.status).json({ message: check.message })

    const settings = await AutomationSettings.findByIdAndUpdate(
      "global",
      {
        ...(autoCallsEnabled !== undefined ? { autoCallsEnabled } : {}),
        ...(voiceEngine !== undefined ? { voiceEngine } : {}),
        updatedBy: check.userId,
      },
      { upsert: true, new: true }
    )

    res.json({ autoCallsEnabled: settings.autoCallsEnabled, voiceEngine: settings.voiceEngine })
  } catch (error) {
    console.error("Error updateAutomationSettings:", error)
    res.status(500).json({ message: "Error actualizando la configuración de automatización" })
  }
}
