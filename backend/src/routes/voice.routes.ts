import { Router } from 'express'
import {
  handleIncoming,
  handleStatus,
  handleOutbound,
  handleNotifyHuman,
  handleNotifyHumanStatus,
  getNotifyHumanStatus,
  getCalls,
  exportCalls,
  getCallCounts,
  handleRecordingStatus,
  getCallRecording,
} from '../controllers/voice.controller'
import { requireAuth } from '../middleware/auth'
import { validateTwilioSignature } from '../middleware/twilioSignature'
import { handleOutboundCartesia, handleIncomingCartesia } from '../controllers/voiceStreamCartesia.controller'

const router = Router()

router.get('/calls', requireAuth, getCalls)
router.get('/calls/counts', requireAuth, getCallCounts)
router.get('/calls/export', requireAuth, exportCalls)
router.post('/voice/outbound', requireAuth, handleOutbound)
router.post('/voice/notify-human', requireAuth, handleNotifyHuman)
router.get('/voice/notify-human-status/:callSid', requireAuth, getNotifyHumanStatus)
router.get('/voice/:id/recording', requireAuth, getCallRecording)

// Piloto Deepgram+Cartesia (ver plan en C:\Users\test\.claude\plans\toasty-riding-floyd.md)
// — aislado del camino de producción de arriba, solo para pruebas puntuales.
router.post('/voice/outbound-cartesia', requireAuth, handleOutboundCartesia)

// Twilio webhooks — Twilio no puede mandar un token de sesión, deben quedar públicos; en su lugar
// se verifica la firma de Twilio (WEBHOOK_SIGNATURE_MODE: 'log' registra, 'enforce' bloquea)
router.post('/voice/incoming', validateTwilioSignature, handleIncoming)
router.post('/voice/incoming-cartesia', validateTwilioSignature, handleIncomingCartesia)
router.post('/voice/status', validateTwilioSignature, handleStatus)
router.post('/voice/notify-human-status', validateTwilioSignature, handleNotifyHumanStatus)
router.post('/voice/recording-status', validateTwilioSignature, handleRecordingStatus)

export default router
