import { inferPetState } from './behavior'
import type { ConversationEvent, PetState, SessionSnapshot } from './types'

export interface SessionMonitorView {
  session: SessionSnapshot
  latestEvent?: ConversationEvent
  petState: PetState
}

export function buildSessionView(
  session: SessionSnapshot,
  latestEvent?: ConversationEvent,
): SessionMonitorView {
  return {
    session,
    latestEvent,
    petState: inferPetState(session, latestEvent),
  }
}

export function selectTopSessions(sessions: SessionSnapshot[], limit: number) {
  return [...sessions]
    .filter((session) => session.alive)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, limit)
}
