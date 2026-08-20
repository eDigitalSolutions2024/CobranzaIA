import { Router } from 'express'
import { handleIncoming, handleGather, handleStatus, handleOutbound, getCalls } from '../controllers/voice.controller'
import { validateTwilioSignature } from '../middleware/twilioSignature'

const router = Router()

router.get('/calls', getCalls)
router.post('/voice/outbound', handleOutbound)

// Twilio webhooks — validate signature in production
router.post('/voice/incoming', validateTwilioSignature, handleIncoming)
router.post('/voice/gather', validateTwilioSignature, handleGather)
router.post('/voice/status', validateTwilioSignature, handleStatus)

export default router
