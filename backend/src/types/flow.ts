export type FlowStateType =
  | 'message'
  | 'collect'
  | 'decision'
  | 'api_call'
  | 'intent'
  | 'transfer'
  | 'end'

export interface FlowStateBase {
  id: string
  type: FlowStateType
}

export interface MessageState extends FlowStateBase {
  type: 'message'
  text?: string
  template?: string
  dynamic?: boolean
  next: string
}

export interface CollectValidation {
  type: 'identity'
  max_attempts: number
  on_success: string
  on_failure: string
}

export interface CollectState extends FlowStateBase {
  type: 'collect'
  prompt: string
  validation?: CollectValidation
  next?: string
}

export interface DecisionRule {
  min?: number
  max?: number
  next: string
}

export interface DecisionState extends FlowStateBase {
  type: 'decision'
  condition?: string
  true?: string
  false?: string
  field?: string
  rules?: DecisionRule[]
}

export interface ApiCallState extends FlowStateBase {
  type: 'api_call'
  service: string
  action: string
  next: string
}

export interface IntentState extends FlowStateBase {
  type: 'intent'
  intents: Record<string, string>
}

export interface TransferState extends FlowStateBase {
  type: 'transfer'
  destination: string
  reason?: string
}

export interface EndState extends FlowStateBase {
  type: 'end'
  text: string
}

export type FlowState =
  | MessageState
  | CollectState
  | DecisionState
  | ApiCallState
  | IntentState
  | TransferState
  | EndState

export interface FlowDefinition {
  flow_id: string
  name: string
  version: string
  start_state: string
  states: FlowState[]
}

// Variables acumuladas durante la llamada (saldo, intentos de identidad,
// monto/fecha del compromiso, etc.). Es deliberadamente laxo (Record<string, any>)
// porque el propio JSON del flujo puede introducir variables nuevas sin tocar código.
export type FlowContext = Record<string, any>
