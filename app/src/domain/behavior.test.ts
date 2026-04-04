import { describe, expect, it } from 'vitest'

import { inferPetState } from './behavior'
import type { ConversationEvent, SessionSnapshot } from './types'

const baseSession: SessionSnapshot = {
  sessionId: 'session-1',
  cwd: 'D:/repo/cc-buddy',
  pid: 42,
  alive: true,
  startedAt: '2026-04-03T12:00:00.000Z',
  updatedAt: '2026-04-03T12:05:00.000Z',
}

function event(type: ConversationEvent['type'], toolName?: string): ConversationEvent {
  return {
    type,
    toolName,
    timestamp: '2026-04-03T12:06:00.000Z',
  }
}

describe('inferPetState', () => {
  it('returns sleeping idle state with no active sessions', () => {
    expect(inferPetState()).toEqual({
      mood: 'idle',
      action: 'sleeping',
      label: 'No active Claude Code sessions',
      intensity: 'low',
    })
  })

  it('maps tool usage to focused writing behavior', () => {
    expect(
      inferPetState(
        baseSession,
        event('tool_use', 'Edit'),
        '2026-04-03T12:06:10.000Z',
      ),
    ).toEqual({
      mood: 'focused',
      action: 'writing_code',
      label: 'Editing source files',
      intensity: 'high',
    })
  })

  it('maps completed results to celebration', () => {
    expect(
      inferPetState(baseSession, event('result'), '2026-04-03T12:06:10.000Z'),
    ).toEqual({
      mood: 'happy',
      action: 'celebrating',
      label: 'Task finished successfully',
      intensity: 'medium',
    })
  })

  it('falls back to idle when the latest event is stale', () => {
    expect(
      inferPetState(
        {
          ...baseSession,
          updatedAt: '2026-04-03T12:00:00.000Z',
        },
        {
          type: 'tool_use',
          toolName: 'Edit',
          timestamp: '2026-04-03T12:00:00.000Z',
        },
        '2026-04-03T12:05:00.000Z',
      ),
    ).toEqual({
      mood: 'idle',
      action: 'sleeping',
      label: 'Session is idle',
      intensity: 'low',
    })
  })
})
