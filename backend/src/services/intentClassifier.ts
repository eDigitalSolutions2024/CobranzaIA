import { ClientEmotion, ConversationState, getBackchannel } from './conversationStateMachine'

export type LocalIntent =
  | 'already_paid'
  | 'wrong_number'
  | 'wants_human'
  | 'wants_whatsapp'
  | 'no_money'
  | 'promise_pay'
  | 'partial_payment'  // client can pay something, but not full amount
  | 'call_back'
  | 'insult'
  | 'goodbye'          // client ends the call naturally
  | 'cooperative'      // positive signal — emotion cue, no direct response needed
  | 'stalling'         // non-committal, buying time
  | 'dispute'          // disputes debt validity
  | 'backchannel'
  | 'unknown'

interface ClassifyResult {
  intent: LocalIntent
  response: string | null   // null = must go to Claude
}

const PATTERNS: Array<{ intent: LocalIntent; patterns: RegExp[] }> = [
  {
    intent: 'already_paid',
    patterns: [
      /ya pagu[eé]/i, /ya deposit[eé]/i, /ya realic[eé]/i,
      /hice el pago/i, /realiz[eé] el pago/i, /ya lo liquid[eé]/i,
      /efectu[eé] el pago/i, /ya cubr[íi]/i,
    ],
  },
  {
    intent: 'wrong_number',
    patterns: [
      /n[uú]mero equivocado/i, /se equivoc[oó]/i, /no conozco (esa )?deuda/i,
      /no soy (yo|esa persona)/i, /n[uú]mero incorrecto/i,
      /no tengo ninguna deuda/i, /no le debo nada/i,
      /no existe (esa|ninguna) cuenta/i,
    ],
  },
  {
    intent: 'wants_human',
    patterns: [
      /quiero hablar con (una? )?(persona|asesor|humano|agente|ejecutivo)/i,
      /me (comunica|conecta|transfiere) con/i,
      /páseme con/i, /un asesor/i, /una persona/i, /con alguien/i,
      /agente humano/i, /con el supervisor/i, /con su jefe/i,
    ],
  },
  {
    intent: 'wants_whatsapp',
    patterns: [
      /whatsapp/i, /m[áa]nd(ame|eme) (un )?mensaje/i,
      /por (escrito|texto|whats)/i, /escr[íi](beme|bame)/i,
      /m[áa]ndame (la )?informaci[óo]n/i, /mándelo por escrito/i,
    ],
  },
  {
    intent: 'call_back',
    patterns: [
      /ll[áa]m(ame|eme) (despu[eé]s|m[áa]s tarde|otro d[íi]a|ma[ñn]ana)/i,
      /no es buen momento/i, /estoy ocupado/i,
      /ahorita no puedo (hablar|atender)/i,
      /m[áa]s tarde (me llama|hablamos)/i, /en otro momento/i,
      /cu[áa]ndo puedo llamarle/i,
    ],
  },
  {
    intent: 'insult',
    patterns: [
      /pinch[eoa]/i, /cabr[oó]n/i, /chinga/i, /pendej/i,
      /idiota/i, /imb[eé]cil/i, /m[áa]ndese a la/i,
      /déjenme en paz/i, /no me (molest|llam)/i,
    ],
  },
  {
    intent: 'goodbye',
    patterns: [
      /^(adi[oó]s|hasta luego|hasta la vista|bye|chao|chau|nos vemos|cu[íi]date|que est[eé] bien)\.?$/i,
      /ya no necesito nada/i, /ya es todo/i, /ya terminamos/i,
      /eso es todo gracias/i, /muchas gracias adi[oó]s/i,
    ],
  },
  {
    intent: 'no_money',
    patterns: [
      /no tengo (el )?dinero/i, /no tengo nada/i, /estoy sin dinero/i,
      /no puedo pagar/i, /sin lana/i, /no me alcanza/i,
      /no tengo (para|con qu[eé])/i, /no tengo trabajo/i,
      /estoy muy mal (económicamente|de dinero)/i,
    ],
  },
  {
    intent: 'partial_payment',
    patterns: [
      /algo (puedo|podr[íi]a) (dar|pagar|depositar)/i,
      /un poco (puedo|podr[íi]a)/i, /no todo pero/i,
      /tengo (algo|un poco|una parte)/i,
      /s[oó]lo puedo (dar|pagar)/i, /parte (puedo|podr[íi]a)/i,
      /una parte (s[íi] |puedo|podr[íi]a)/i,
    ],
  },
  {
    intent: 'promise_pay',
    patterns: [
      /te pago (el |la )?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado|domingo)/i,
      /pago (el |la )?(pr[oó]xima semana|semana que entra|quincena)/i,
      /voy a pagar (hoy|ma[ñn]ana|esta semana|el viernes)/i,
      /puedo pagar (el|la|esta|este)/i,
      /el (lunes|martes|mi[eé]rcoles|jueves|viernes) (le |te )?pago/i,
      /le (pago|deposito|transfiero) (hoy|ma[ñn]ana|esta semana)/i,
      /le caigo (el|esta|esta semana)/i,
    ],
  },
  {
    intent: 'stalling',
    patterns: [
      /d[eé]j(eme|ame) (pensarlo|verlo|revisarlo|checar)/i,
      /tengo que hablarlo/i, /lo tengo que ver/i,
      /no s[eé] todav[íi]a/i, /d[eé]j[ae]me ver/i,
      /ya veremos/i, /lo pienso/i, /d[eé]jeme checar/i,
    ],
  },
  {
    intent: 'dispute',
    patterns: [
      /eso no es correcto/i, /est[áa]n equivocados/i,
      /no reconozco (esa )?deuda/i, /no es mi deuda/i,
      /ya fue (liquidado|cancelado|pagado)/i,
      /tengo (el )?comprobante/i, /tengo (el )?recibo/i,
      /hay un error/i, /no corresponde/i,
    ],
  },
  {
    intent: 'cooperative',
    patterns: [
      /s[íi] se[ñn]orita/i, /con mucho gusto/i, /c[oó]mo no/i,
      /claro que s[íi]/i, /voy a intentar/i,
      /le voy a (pagar|depositar)/i, /s[íi] puedo/i,
    ],
  },
  {
    intent: 'backchannel',
    patterns: [
      /^(s[íi]|si|claro|okay|ok|bueno|est[áa] bien|de acuerdo|aj[áa]|entendido|por supuesto|mm|mhm|ya|sí ya)\.?$/i,
    ],
  },
]

// Response pools for intents resolved locally — varied per call so it doesn't sound identical.
// undefined entries must go to Claude (too nuanced for a scripted response).
const LOCAL_RESPONSE_POOLS: Partial<Record<LocalIntent, string[] | null>> = {
  already_paid: [
    'Perfecto, verificaremos su pago y le notificamos. Gracias y buen día. FIN_LLAMADA',
    'Muchas gracias, lo checamos y le avisamos. Que esté bien. FIN_LLAMADA',
    'Con gusto lo verificamos. Le mandamos confirmación. Buen día. FIN_LLAMADA',
  ],
  wrong_number: [
    'Con mucho gusto, disculpe la molestia. Que tenga buen día. FIN_LLAMADA',
    'Perdone el inconveniente, fue un error nuestro. Buen día. FIN_LLAMADA',
  ],
  wants_human: [
    'Claro, en un momento le comunico con un asesor. REQUIERE_HUMANO',
    'Con gusto, le paso con un asesor ahora mismo. REQUIERE_HUMANO',
  ],
  wants_whatsapp: [
    'Con gusto, le mando la información por WhatsApp ahorita. Hasta luego. FIN_LLAMADA',
    'Claro, le enviamos los detalles al WhatsApp. Que esté bien. FIN_LLAMADA',
  ],
  call_back: [
    'Claro, le llamamos en otro momento. Que esté bien. FIN_LLAMADA',
    'Por supuesto, buscamos otro momento. Buen día. FIN_LLAMADA',
    'Entendido, le contactamos después. Gracias. FIN_LLAMADA',
  ],
  insult: [
    'Entiendo que está molesto. Le llamamos en otro momento. Buen día. FIN_LLAMADA',
  ],
  goodbye: [
    'Que tenga buen día, hasta luego. FIN_LLAMADA',
    'Fue un placer, hasta luego. FIN_LLAMADA',
    'Gracias, cuídese. Hasta luego. FIN_LLAMADA',
  ],
  // These go to Claude — too nuanced for a scripted response
  no_money:        null,
  partial_payment: null,
  promise_pay:     null,
  stalling:        null,
  dispute:         null,
  cooperative:     null,
}

function pickResponse(intent: LocalIntent): string | null {
  const pool = LOCAL_RESPONSE_POOLS[intent]
  if (!pool) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Emotion detection ──────────────────────────────────────────────────────
// Infers the client's emotional state from their message and detected intent.
// Used to adjust Claude's tone via the state machine.

const EMOTION_PATTERNS: Array<{ emotion: Exclude<ClientEmotion, 'neutral'>; patterns: RegExp[] }> = [
  {
    emotion: 'angry',
    patterns: [
      /ya me cans[eé]/i, /est[áa]n acosando/i, /me molesta/i,
      /no me (llame|llamen) m[áa]s/i, /voy a denunciar/i, /es un abuso/i,
      /déjenme en paz/i, /están fastidiando/i,
    ],
  },
  {
    emotion: 'distressed',
    patterns: [
      /perd[íi] (el |mi )?trabajo/i, /estoy enferm[oa]/i,
      /tuve un accidente/i, /estoy muy mal/i,
      /no tengo para comer/i, /no s[eé] qu[eé] voy a hacer/i,
      /situaci[oó]n muy dif[íi]cil/i,
    ],
  },
  {
    emotion: 'cooperative',
    patterns: [
      /s[íi] se[ñn]orita/i, /con mucho gusto/i, /c[oó]mo no/i,
      /claro que s[íi]/i, /voy a intentar/i, /le voy a (pagar|depositar)/i,
    ],
  },
  {
    emotion: 'resistant',
    patterns: [
      /d[eé]j(eme|ame) pensarlo/i, /tengo que hablarlo/i,
      /no estoy seguro/i, /lo tengo que ver/i, /ya veremos/i,
    ],
  },
]

export function detectEmotion(text: string, intent: LocalIntent): ClientEmotion {
  // Strong intent-to-emotion mappings (shortcut, no regex needed)
  if (intent === 'insult') return 'angry'
  if (intent === 'no_money') return 'distressed'
  if (intent === 'cooperative' || intent === 'partial_payment') return 'cooperative'
  if (intent === 'stalling') return 'resistant'

  for (const { emotion, patterns } of EMOTION_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return emotion
  }
  return 'neutral'
}

// ── Main classifier ────────────────────────────────────────────────────────

export function classifyIntent(
  text: string,
  state: ConversationState = 'negotiating'
): ClassifyResult {
  for (const { intent, patterns } of PATTERNS) {
    if (patterns.some((p) => p.test(text))) {
      if (intent === 'backchannel') {
        return { intent, response: getBackchannel(state) }
      }
      return { intent, response: pickResponse(intent) }
    }
  }
  return { intent: 'unknown', response: null }
}
