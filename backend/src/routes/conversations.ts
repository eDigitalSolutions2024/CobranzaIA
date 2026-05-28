import { Router } from "express"
import {
  getConversations,
  getConversationMessages,
  markConversationRead,
} from "../controllers/conversationController"

const router = Router()

router.get("/conversations", getConversations)
router.get("/conversations/:id/messages", getConversationMessages)
router.patch("/conversations/:id/read", markConversationRead)

export default router
