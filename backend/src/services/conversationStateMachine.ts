// Conversation state machine for debt collection voice calls.
// Key design principle: guidance includes EXAMPLE PHRASES, not just instructions.
// Claude adapts them naturally rather than following robotic directives.

export type ConversationState =
  | 'greeting'
  | 'negotiating'
  | 'handling_objection'
  | 'confirming_payment'
  | 'closing'
  | 'escalating'

export type ClientEmotion =
  | 'neutral'
  | 'cooperative'
  | 'resistant'
  | 'angry'
  | 'distressed'

// State-specific guidance injected into the system prompt.
// Uses example phrases so Claude sounds natural, not like following a script.
const STATE_GUIDANCE: Record<ConversationState, string> = {
  greeting: `\
TURNO INICIAL: Saluda, preséntate y confirma que hablas con el cliente. \
Di algo como: "Buenos días, ¿me comunico con [nombre]? Soy Guadalupe, del área de cobranza." \
Luego menciona el saldo brevemente y espera respuesta. \
Máximo 2 oraciones.`,

  negotiating: `\
NEGOCIACIÓN ACTIVA: Propón una fecha concreta y escucha. \
Ejemplos: "¿Le sería posible ponerse al corriente esta semana?" / "¿Qué fecha le queda bien?" \
Si no puede el total: "¿Y un abono para empezar, aunque sea chico?" \
Una propuesta a la vez. No hagas dos preguntas seguidas.`,

  handling_objection: `\
MANEJO DE OBJECIÓN: Valida primero, propón solución después. \
Ejemplos: "Entiendo, no es fácil." / "Le entiendo perfectamente." \
Luego: "¿Qué cantidad le sería posible antes del [fecha próxima]?" \
Si insiste en que no puede nada: "¿Y si buscamos una fecha para más adelante?" \
Sin presión. Una pregunta a la vez.`,

  confirming_payment: `\
CONFIRMACIÓN DE PAGO: Resume el acuerdo con precisión y pide confirmación explícita. \
Di algo como: "Entonces quedamos en que el [fecha] va a depositar [monto] pesos, ¿es correcto?" \
Espera que diga "sí" o confirme. Luego usa promise_of_payment con esa fecha y monto exactos. \
Si cambia algo, ajusta antes de confirmar.`,

  closing: `\
CIERRE: Despídete con calidez, menciona brevemente lo acordado si lo hubo. \
Ejemplos: "Muchas gracias, [nombre]. Le esperamos el [fecha]." / "Que tenga buen día." \
Usa end_call al terminar.`,

  escalating: `\
TRANSFERENCIA A ASESOR: Informa que conectarás a alguien que puede ayudarle más. \
Di: "En un momento le comunico con un asesor que le puede orientar mejor." \
Sé cálida. Usa end_call con reason=requires_human.`,
}

// Tone adjustments based on detected client emotion.
// Also uses example phrases so they feel natural in context.
const EMOTION_TONE: Record<ClientEmotion, string> = {
  neutral: '',

  cooperative: `\
TONO: Cliente receptivo. Avanza con confianza. \
Puedes proponer fechas concretas directamente.`,

  resistant: `\
TONO: Cliente dubitativo. No presiones. \
Haz preguntas abiertas: "¿Qué le preocupa?" / "¿Cuándo le vendría mejor?" \
Escucha más de lo que hablas.`,

  angry: `\
TONO: Cliente molesto. Valida su molestia ANTES de cualquier propuesta. \
Di algo como: "Entiendo perfectamente, tiene toda la razón en sentirse así." \
Si persiste: "¿Le llamamos en otro momento que sea más conveniente?"`,

  distressed: `\
TONO: Cliente con dificultad real. Muestra empatía genuina, sin prisa. \
Di algo como: "Entiendo, es una situación complicada." \
Ofrece el monto mínimo posible: "¿Aunque sea un pequeño abono para registrar su voluntad de pago?" \
O un plan de cuotas muy pequeñas si la deuda lo permite.`,
}

export function getStateGuidance(state: ConversationState, emotion: ClientEmotion): string {
  const stateText = STATE_GUIDANCE[state]
  const emotionText = EMOTION_TONE[emotion]
  return emotionText ? `${stateText}\n${emotionText}` : stateText
}

// State-aware backchannels — more variants per state to avoid repetition on long calls.
const BACKCHANNELS: Record<ConversationState, string[]> = {
  greeting: [
    'Sí, dígame.',
    'Claro, le escucho.',
    'Con gusto.',
    'Sí, cuénteme.',
  ],
  negotiating: [
    'Entiendo.',
    'De acuerdo.',
    'Le escucho.',
    'Claro.',
    'Sí, ya veo.',
    'Mm, entiendo.',
  ],
  handling_objection: [
    'Entiendo su situación.',
    'Comprendo perfectamente.',
    'Le entiendo.',
    'Claro, le escucho.',
    'Entiendo, no es fácil.',
  ],
  confirming_payment: [
    'Perfecto.',
    'Muy bien.',
    'Excelente.',
    'De acuerdo, anotado.',
  ],
  closing: [
    'Con gusto.',
    'Que tenga buen día.',
    'Hasta luego.',
  ],
  escalating: [
    'Claro, en un momento.',
    'Por supuesto.',
    'Con gusto le comunico.',
  ],
}

export function getBackchannel(state: ConversationState): string {
  const phrases = BACKCHANNELS[state]
  return phrases[Math.floor(Math.random() * phrases.length)]
}

// Determines next state based on what just happened.
// Called after each turn — pure function, no side effects.
export function transitionState(params: {
  current: ConversationState
  agentIntent: string
  clientIntent: string
  turnCount: number
}): ConversationState {
  const { current, agentIntent, clientIntent, turnCount } = params

  // Agent tool calls — highest priority
  if (agentIntent === 'requires_human') return 'escalating'
  if (agentIntent === 'goodbye')         return 'closing'
  if (agentIntent === 'promise_of_payment') return 'confirming_payment'

  // Client-driven transitions
  if (clientIntent === 'wants_human')                               return 'escalating'
  if (clientIntent === 'already_paid' || clientIntent === 'wrong_number') return 'closing'
  if (clientIntent === 'goodbye')                                   return 'closing'
  if (clientIntent === 'no_money' || clientIntent === 'call_back')  return 'handling_objection'
  if (clientIntent === 'insult')                                    return 'handling_objection'
  if (clientIntent === 'promise_pay' || clientIntent === 'partial_payment') return 'confirming_payment'

  // Auto-advance greeting after first client response
  if (current === 'greeting' && turnCount >= 2) return 'negotiating'

  // Recovery: objection resolved when client becomes cooperative
  if (current === 'handling_objection' && clientIntent === 'cooperative') return 'negotiating'

  return current
}
