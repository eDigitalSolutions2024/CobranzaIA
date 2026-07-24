import { Router } from "express"

import {sendWhatsapp,verifyWebhook,receiveWebhook}from "../controllers/whatsappController"
import { requireAuth } from "../middleware/auth"

const router = Router()

router.post("/send-whatsapp",requireAuth,sendWhatsapp)

// META → valida webhook
router.get("/webhook",verifyWebhook)

// META → manda eventos
router.post("/webhook",receiveWebhook)


export default router