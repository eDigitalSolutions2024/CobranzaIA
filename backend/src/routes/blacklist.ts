import { Router } from "express"
import { getBlacklist, updateBlacklistEntry } from "../controllers/blacklistController"
import { getAttentionQueue } from "../controllers/attentionController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/blacklist", requireAuth, getBlacklist)
router.patch("/blacklist/:id", requireAuth, updateBlacklistEntry)
router.get("/attention-queue", requireAuth, getAttentionQueue)

export default router
