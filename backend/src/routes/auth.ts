import { Router } from "express"
import rateLimit from "express-rate-limit"
import { login, logoutAll, getAuditLog, me } from "../controllers/authController"
import { requireAuth } from "../middleware/auth"

const router = Router()

// Fuerza bruta: sin esto, cualquiera puede probar contraseñas sin límite contra
// un email conocido (ej. el admin). Cuenta solo intentos FALLIDOS por IP
// (skipSuccessfulRequests) para no penalizar a alguien que ya inició sesión bien.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos." },
})

router.post("/auth/login", loginLimiter, login)
router.post("/auth/logout-all", requireAuth, logoutAll)
router.get("/auth/audit-log", requireAuth, getAuditLog)
router.get("/auth/me", requireAuth, me)

export default router
