import { ConversationTurn, ClientInfo } from './claudeVoice.service'
import { ConversationState, ClientEmotion } from './conversationStateMachine'

export interface CallSession {
  clientInfo: ClientInfo | null
  history: ConversationTurn[]
  summary: string | null     // compressed context of dropped turns, generated once at turn 8
  state: ConversationState   // current phase of the conversation
  emotion: ClientEmotion     // client's detected emotional state
  silenceCount: number
  phone: string
  createdAt: number
}

const sessions = new Map<string, CallSession>()

const SESSION_TTL_MS = 30 * 60 * 1000

export function createSession(
  callSid: string,
  session: Omit<CallSession, 'createdAt' | 'summary' | 'state' | 'emotion'>
): void {
  sessions.set(callSid, {
    ...session,
    summary: null,
    state: 'greeting',
    emotion: 'neutral',
    createdAt: Date.now(),
  })
}

export function getSession(callSid: string): CallSession | undefined {
  return sessions.get(callSid)
}

export function pushTurn(callSid: string, turn: ConversationTurn): void {
  const s = sessions.get(callSid)
  if (s) s.history.push(turn)
}

export function incrementSilence(callSid: string): number {
  const s = sessions.get(callSid)
  if (!s) return 0
  s.silenceCount += 1
  return s.silenceCount
}

export function setSummary(callSid: string, summary: string): void {
  const s = sessions.get(callSid)
  if (s) s.summary = summary
}

// Updates both state and emotion together — they always change as a pair.
export function updateConversationContext(
  callSid: string,
  state: ConversationState,
  emotion: ClientEmotion
): void {
  const s = sessions.get(callSid)
  if (s) { s.state = state; s.emotion = emotion }
}

export function deleteSession(callSid: string): void {
  sessions.delete(callSid)
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [sid, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(sid)
  }
}, 10 * 60 * 1000).unref()
