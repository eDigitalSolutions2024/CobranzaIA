import { Router } from 'express'
import {
  handleIncoming,
  handleStatus,
  handleOutbound,
  handleNotifyHuman,
  handleNotifyHumanStatus,
  getNotifyHumanStatus,
  getCalls,
} from '../controllers/voice.controller'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.get('/calls', requireAuth, getCalls)
router.post('/voice/outbound', requireAuth, handleOutbound)
router.post('/voice/notify-human', requireAuth, handleNotifyHuman)
router.get('/voice/notify-human-status/:callSid', requireAuth, getNotifyHumanStatus)

// Twilio webhooks — Twilio no puede mandar un token de sesión, deben quedar públicos
router.post('/voice/incoming', handleIncoming)
router.post('/voice/status', handleStatus)
router.post('/voice/notify-human-status', handleNotifyHumanStatus)

export default router
