export type ConversationEventType =
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error'

export interface SessionSnapshot {
  sessionId: string
  cwd: string
  pid: number
  alive: boolean
  startedAt: string
  updatedAt: string
}

export interface ConversationEvent {
  type: ConversationEventType
  timestamp: string
  toolName?: string
  detail?: string
}

export type PetMood =
  | 'idle'
  | 'thinking'
  | 'excited'
  | 'focused'
  | 'curious'
  | 'hunting'
  | 'busy'
  | 'happy'
  | 'worried'

export type PetAction =
  | 'sleeping'
  | 'pondering'
  | 'running_command'
  | 'writing_code'
  | 'reading'
  | 'searching'
  | 'delegating'
  | 'celebrating'
  | 'debugging'

export type PetIntensity = 'low' | 'medium' | 'high'

export interface PetState {
  mood: PetMood
  action: PetAction
  label: string
  intensity: PetIntensity
}

export interface CompanionInput {
  name: string
  personality: string
  hatchedAt: string
}

export interface CompanionState extends CompanionInput {
  ageDays: number
}

export interface TailState {
  offset: number
  remainder: string
}

export interface SessionRoom {
  session: SessionSnapshot
  latestEvent?: ConversationEvent
  petState: PetState
}

export interface MonitorSnapshot {
  companion: CompanionState
  rooms: SessionRoom[]
  feed: ConversationEvent[]
  activeCount: number
}

export interface MonitorDelta {
  companion?: CompanionState
  rooms?: SessionRoom[]
  feedAppend: ConversationEvent[]
  activeCount?: number
}
