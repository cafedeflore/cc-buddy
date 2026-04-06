import { inferPetState } from './behavior'
import type { ConversationEvent, PetState, SessionRoom, SessionSnapshot } from './types'

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

export function selectPrimaryRoom(rooms: SessionRoom[]): SessionRoom | undefined {
  return [...rooms].sort((left, right) => roomActivityTime(right) - roomActivityTime(left))[0]
}

function roomActivityTime(room: SessionRoom): number {
  const latestEventTime = room.latestEvent ? Date.parse(room.latestEvent.timestamp) : Number.NaN
  const updatedAtTime = Date.parse(room.session.updatedAt)

  const latest = Math.max(
    Number.isFinite(latestEventTime) ? latestEventTime : Number.NEGATIVE_INFINITY,
    Number.isFinite(updatedAtTime) ? updatedAtTime : Number.NEGATIVE_INFINITY,
  )

  return Number.isFinite(latest) ? latest : Number.NEGATIVE_INFINITY
}
