import { Router } from "express"
import {
  listExchangeRates,
  upsertExchangeRate,
  getAutomationSettings,
  updateAutomationSettings,
  updateManualCallFlow,
} from "../controllers/settingsController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/settings/exchange-rates", requireAuth, listExchangeRates)
router.put("/settings/exchange-rates", requireAuth, upsertExchangeRate)
router.get("/settings/automation", requireAuth, getAutomationSettings)
router.put("/settings/automation", requireAuth, updateAutomationSettings)
router.put("/settings/manual-call-flow", requireAuth, updateManualCallFlow)

export default router
