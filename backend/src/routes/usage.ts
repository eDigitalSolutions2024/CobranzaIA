import { Router } from "express"
import { getUsage } from "../controllers/usageController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/usage", requireAuth, getUsage)

export default router
