import { Router } from "express"
import { login, me } from "../controllers/authController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.post("/auth/login", login)
router.get("/auth/me", requireAuth, me)

export default router
