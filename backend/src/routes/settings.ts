import { Router } from "express"
import {
  listExchangeRates,
  upsertExchangeRate,
  getAutomationSettings,
  updateAutomationSettings,
} from "../controllers/settingsController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/settings/exchange-rates", requireAuth, listExchangeRates)
router.put("/settings/exchange-rates", requireAuth, upsertExchangeRate)
router.get("/settings/automation", requireAuth, getAutomationSettings)
router.put("/settings/automation", requireAuth, updateAutomationSettings)

export default router
