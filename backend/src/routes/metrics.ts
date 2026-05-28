import { Router } from "express"
import { getMetrics } from "../controllers/metricsController"

const router = Router()

router.get("/metrics", getMetrics)

export default router
