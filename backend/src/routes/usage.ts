import { Router } from "express"
import { getUsage, getAnthropicUsage } from "../controllers/usageController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/usage", requireAuth, getUsage)
router.get("/usage/anthropic", requireAuth, getAnthropicUsage)

export default router
