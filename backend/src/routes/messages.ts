import {
Router
}
from "express"

import {
getMessages
}
from "../controllers/messageController"

const router =
Router()

router.get(
"/messages",
getMessages
)

export default router