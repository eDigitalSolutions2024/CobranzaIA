import { Router } from "express"
import { getExchangeRate, updateExchangeRate } from "../controllers/settingsController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/settings/exchange-rate", requireAuth, getExchangeRate)
router.put("/settings/exchange-rate", requireAuth, updateExchangeRate)

export default router
