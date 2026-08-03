import { Router } from 'express'
import { handleIncoming, handleStatus, handleOutbound, getCalls } from '../controllers/voice.controller'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.get('/calls', requireAuth, getCalls)
router.post('/voice/outbound', requireAuth, handleOutbound)

// Twilio webhooks — Twilio no puede mandar un token de sesión, deben quedar públicos
router.post('/voice/incoming', handleIncoming)
router.post('/voice/status', handleStatus)

export default router
