import { Router } from "express"
import {
  getConversations,
  getConversationMessages,
  markConversationRead,
} from "../controllers/conversationController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.get("/conversations", requireAuth, getConversations)
router.get("/conversations/:id/messages", requireAuth, getConversationMessages)
router.patch("/conversations/:id/read", requireAuth, markConversationRead)

export default router
