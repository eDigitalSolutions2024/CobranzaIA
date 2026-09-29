// Genera el turno del agente de voz usando Claude (piloto Deepgram+Cartesia) — a
// diferencia de claudeVoice.service.ts (generateVoiceResponse, que parsea marcadores de
// texto tipo PROMESA_PAGO:... y ya se documentó como poco confiable), esto usa
// tool-calling nativo de Claude, igual que ya se resolvió para el pipeline de OpenAI
// Realtime (ver voiceConversation.service.ts) — mismo patrón validado en
// whatsappFlow.service.ts.
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_VOICE_MODEL } from '../config/voicePipeline'
import { VOICE_TOOLS, buildVoiceSystemPrompt, ClientInfo } from './voiceConversation.service'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Las tools se derivan de VOICE_TOOLS (formato Realtime API de OpenAI: {type, name,
// description, parameters}) en vez de redeclararlas — así nunca se desalinean si alguien
// edita una función ahí y se le olvida replicarla aquí. `parameters` de OpenAI y
// `input_schema` de Anthropic son el mismo JSON Schema.
const CLAUDE_VOICE_TOOLS: Anthropic.Tool[] = VOICE_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters as Anthropic.Tool.InputSchema,
}))

// Reglas propias de este pipeline (no aplican al de OpenAI Realtime): cada vuelta extra a
// Claude cuesta ~1s de silencio para el cliente, y todo texto que Claude escriba se lee
// en voz alta tal cual (incluyendo acotaciones entre paréntesis).
const LIVE_FORMAT_RULES = `

FORMATO DE ESTA LLAMADA EN VIVO (obligatorio):
- En cada turno escribe TODO lo que vas a decir en voz alta en un solo mensaje, y llama las funciones de registro (confirmar_identidad, etc.) en ese mismo turno.
- Nunca respondas solo con una frase de cortesía como "Perfecto, gracias." dejando la siguiente pregunta del guion para después de llamar la función: incluye la siguiente pregunta en ese mismo mensaje.
- Todo lo que escribas se lee en voz alta: no escribas acotaciones, notas ni texto entre paréntesis.
- CIFRAS (reemplaza la regla "Montos en palabras" de arriba): escribe montos, cantidades y fechas con DÍGITOS, tal como vienen en los datos — ej. "1,685,641.34 pesos", "91 días", "19 facturas", "el 15 de octubre". El sistema de voz los convierte a palabras con la gramática correcta; si tú los escribes con letra, salen errores como "noventa y uno días".`

export interface LiveTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface LiveToolCall {
  name: string
  input: Record<string, unknown>
}

// Resultado real de ejecutar una tool: se le regresa a Claude como tool_result. followUp = el
// resultado exige que Claude reaccione aunque su último texto haya sido una pregunta.
export interface ToolOutcome {
  output: string
  followUp?: boolean
}

export interface LiveTurnResult {
  message: string
  toolCalls: LiveToolCall[]
  // Tokens de Claude consumidos en este turno (todas las vueltas de tools sumadas) — se
  // acumulan en Call.claudeUsage para que la pantalla de Usage refleje también las
  // llamadas por ElevenLabs.
  usage: { inputTokens: number; outputTokens: number }
}

export async function generateLiveVoiceTurn(
  history: LiveTurn[],
  clientInfo: ClientInfo | null,
  phone: string,
  onText?: (delta: string) => void,
  executeTool?: (call: LiveToolCall) => Promise<ToolOutcome>
): Promise<LiveTurnResult> {
  const system = buildCachedSystem(clientInfo, phone)

  const messages: Anthropic.MessageParam[] =
    history.length > 0 ? history.map((t) => ({ role: t.role, content: t.content })) : []

  // Igual que generateVoiceResponse/whatsappFlow.service.ts: Anthropic exige que el
  // primer mensaje sea 'user' — [INICIO_LLAMADA] dispara el saludo inicial cuando el
  // historial está vacío.
  if (messages.length === 0 || messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: '[INICIO_LLAMADA]' })
  }

  const toolCalls: LiveToolCall[] = []
  let message = ''
  const usage = { inputTokens: 0, outputTokens: 0 }

  // Claude a veces responde SOLO con la tool (ej. confirmar_identidad) y sin texto — si el
  // turno terminara ahí, el cliente oiría silencio. Igual que en el pipeline de OpenAI, se
  // le regresa el resultado de la tool y se le deja continuar hasta que hable (máx. 3 vueltas).
  for (let i = 0; i < 3; i++) {
    // Streaming: cada pedazo de texto se entrega en cuanto Claude lo genera (onText) para
    // que la voz arranque con la primera frase sin esperar la respuesta completa.
    const stream = anthropic.messages.stream({
      model: CLAUDE_VOICE_MODEL,
      max_tokens: 300,
      system,
      tools: CLAUDE_VOICE_TOOLS,
      tool_choice: { type: 'auto' },
      messages,
    })
    if (onText) stream.on('text', (delta) => onText(delta))
    const response = await stream.finalMessage()
    // claudeUsage solo tiene input/output y el dashboard de uso los cobra a precio normal —
    // los tokens de caché se suman como su equivalente en precio (escritura 1.25x, lectura
    // 0.1x) para que el costo mostrado siga cuadrando con la factura.
    const cacheWrite = response.usage.cache_creation_input_tokens ?? 0
    const cacheRead = response.usage.cache_read_input_tokens ?? 0
    usage.inputTokens += response.usage.input_tokens + Math.round(cacheWrite * 1.25) + Math.round(cacheRead * 0.1)
    usage.outputTokens += response.usage.output_tokens
    console.log(
      `[ClaudeVoiceLive] tokens: ${response.usage.input_tokens} nuevos · ${cacheRead} desde caché · ${cacheWrite} escritos en caché`
    )

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

    message = message ? `${message} ${text}`.trim() : text
    const outcomes: ToolOutcome[] = []
    for (const b of toolUses) {
      const call: LiveToolCall = { name: b.name, input: (b.input as Record<string, unknown>) ?? {} }
      toolCalls.push(call)
      outcomes.push(executeTool ? await executeTool(call) : { output: 'ok' })
    }

    // Termina el turno si no hubo tools, si alguna cierra la llamada, o si lo último que
    // dijo Claude es una pregunta (le toca al cliente). Si solo dijo algo como "Perfecto,
    // gracias." y llamó una tool de registro, se le deja seguir con el siguiente paso del
    // guion — antes el turno se daba por terminado ahí y la llamada se quedaba en silencio.
    // marcar_extension también cierra el turno: es un conmutador, no hay nada que decirle
    // (el controlador cuelga y remarca solo) — sin esto Claude recibía el resultado de la
    // tool y seguía "conversando" con el menú automático.
    const closesCall = toolUses.some(
      (b) => b.name === 'finalizar_llamada' || b.name === 'requerir_humano' || b.name === 'marcar_extension'
    )
    if (toolUses.length === 0 || closesCall || (text.endsWith('?') && !outcomes.some((o) => o.followUp))) break
    if (onText) onText(' ')

    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: toolUses.map((b, i) => ({ type: 'tool_result' as const, tool_use_id: b.id, content: outcomes[i].output })),
    })
  }

  return { message, toolCalls, usage }
}

// Guion + reglas de formato como un solo bloque con cache_control: las herramientas y el
// guion son idénticos en todos los turnos de una llamada (render order: tools → system →
// messages), así que desde el segundo turno Claude los lee del caché en vez de
// reprocesar ~10k tokens cada vez — eso era la mayor parte de la espera entre frases.
// Lo que sigue al breakpoint (el historial de la conversación) se procesa normal.
function buildCachedSystem(clientInfo: ClientInfo | null, phone: string): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: buildVoiceSystemPrompt(clientInfo, phone) + LIVE_FORMAT_RULES,
      cache_control: { type: 'ephemeral' },
    },
  ]
}

// Abre la conexión con Anthropic (TLS + HTTP keep-alive) antes del primer turno real —
// sin esto, el primer turno del cliente pagaba ~600ms extra de handshake (medido en la
// primera prueba: primer texto a 1240ms vs ~600ms en los turnos siguientes). Usa EXACTAMENTE
// el mismo system que los turnos reales (buildCachedSystem), así que además deja el caché
// de prompts escrito mientras suena el saludo — el primer turno del cliente ya lo lee.
export async function warmUpClaude(clientInfo: ClientInfo | null, phone: string): Promise<void> {
  try {
    await anthropic.messages.create({
      model: CLAUDE_VOICE_MODEL,
      max_tokens: 1,
      system: buildCachedSystem(clientInfo, phone),
      tools: CLAUDE_VOICE_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: '[INICIO_LLAMADA]' }],
    })
  } catch {
    // Solo es un calentamiento: si falla, el primer turno real lo reintenta normalmente.
  }
}
