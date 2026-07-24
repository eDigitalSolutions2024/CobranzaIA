import {
Router
}
from "express"

import {
getMessages
}
from "../controllers/messageController"
import { requireAuth } from "../middleware/auth"

const router =
Router()

router.get(
"/messages",
requireAuth,
getMessages
)

export default router