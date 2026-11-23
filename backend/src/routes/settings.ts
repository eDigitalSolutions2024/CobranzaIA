import { Router } from "express"
import {
  listExchangeRates,
  upsertExchangeRate,
  getAutomationSettings,
  updateAutomationSettings,
  updateManualCallFlow,
  getRecordingSettings,
  updateRecordingSettings,
} from "../controllers/settingsController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/settings/exchange-rates", requireAuth, listExchangeRates)
router.put("/settings/exchange-rates", requireAuth, upsertExchangeRate)
router.get("/settings/automation", requireAuth, getAutomationSettings)
router.put("/settings/automation", requireAuth, updateAutomationSettings)
router.get("/settings/recording", requireAuth, getRecordingSettings)
router.put("/settings/recording", requireAuth, updateRecordingSettings)
router.put("/settings/manual-call-flow", requireAuth, updateManualCallFlow)

export default router
