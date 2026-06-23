import { Router } from 'express'
import { handleIncoming, handleGather, handleStatus, handleOutbound, getCalls } from '../controllers/voice.controller'

const router = Router()

router.get('/calls', getCalls)
router.post('/voice/outbound', handleOutbound)
router.post('/voice/incoming', handleIncoming)
router.post('/voice/gather', handleGather)
router.post('/voice/status', handleStatus)

export default router
