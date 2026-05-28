import { Router } from "express"

import {sendWhatsapp,verifyWebhook,receiveWebhook}from "../controllers/whatsappController"

const router = Router()

router.post("/send-whatsapp",sendWhatsapp)

// META → valida webhook
router.get("/webhook",verifyWebhook)

// META → manda eventos
router.post("/webhook",receiveWebhook)


export default router