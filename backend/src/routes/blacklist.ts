import { Router } from "express"
import { getBlacklist, updateBlacklistEntry } from "../controllers/blacklistController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/blacklist", requireAuth, getBlacklist)
router.patch("/blacklist/:id", requireAuth, updateBlacklistEntry)

export default router
