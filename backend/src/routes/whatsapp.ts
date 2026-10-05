import { Router } from "express"

import {sendWhatsapp,verifyWebhook,receiveWebhook}from "../controllers/whatsappController"
import { requireAuth } from "../middleware/auth"
import { validateMetaSignature } from "../middleware/metaSignature"

const router = Router()

router.post("/send-whatsapp",requireAuth,sendWhatsapp)

// META → valida webhook
router.get("/webhook",verifyWebhook)

// META → manda eventos
router.post("/webhook",validateMetaSignature,receiveWebhook)


export default router