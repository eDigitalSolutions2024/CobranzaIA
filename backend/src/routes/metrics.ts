import { Router } from "express"
import { getMetrics } from "../controllers/metricsController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/metrics", requireAuth, getMetrics)

export default router
