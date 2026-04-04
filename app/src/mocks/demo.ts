import { buildSessionView, selectTopSessions } from '../domain/monitor'
import { syncCompanion } from '../domain/companion'
import type { ConversationEvent, MonitorSnapshot, SessionSnapshot } from '../domain/types'

const sessions: SessionSnapshot[] = [
  {
    sessionId: 'alpha',
    cwd: 'D:/repo/cc-buddy',
    pid: 4411,
    alive: true,
    startedAt: '2026-04-03T12:01:00.000Z',
    updatedAt: '2026-04-03T12:18:00.000Z',
  },
  {
    sessionId: 'beta',
    cwd: 'D:/repo/siltpaw',
    pid: 4412,
    alive: true,
    startedAt: '2026-04-03T12:05:00.000Z',
    updatedAt: '2026-04-03T12:16:00.000Z',
  },
  {
    sessionId: 'gamma',
    cwd: 'D:/repo/tooling',
    pid: 4413,
    alive: true,
    startedAt: '2026-04-03T12:06:00.000Z',
    updatedAt: '2026-04-03T12:11:00.000Z',
  },
]

const eventFrames: Record<string, ConversationEvent[]> = {
  alpha: [
    { type: 'assistant', timestamp: '2026-04-03T12:18:00.000Z', detail: 'Planning next step' },
    { type: 'tool_use', timestamp: '2026-04-03T12:18:08.000Z', toolName: 'Edit', detail: 'Patching UI files' },
    { type: 'result', timestamp: '2026-04-03T12:18:24.000Z', detail: 'Patch applied' },
  ],
  beta: [
    { type: 'tool_use', timestamp: '2026-04-03T12:16:00.000Z', toolName: 'Read', detail: 'Inspecting plan.md' },
    { type: 'tool_use', timestamp: '2026-04-03T12:16:12.000Z', toolName: 'Grep', detail: 'Searching for state hooks' },
    { type: 'assistant', timestamp: '2026-04-03T12:16:24.000Z', detail: 'Thinking through data flow' },
  ],
  gamma: [
    { type: 'tool_use', timestamp: '2026-04-03T12:11:00.000Z', toolName: 'Bash', detail: 'Running verification' },
    { type: 'error', timestamp: '2026-04-03T12:11:18.000Z', detail: 'Rust toolchain missing' },
    { type: 'tool_use', timestamp: '2026-04-03T12:11:30.000Z', toolName: 'Agent', detail: 'Delegating code review' },
  ],
}

export function createDemoSnapshot(frame: number): MonitorSnapshot {
  const visibleSessions = selectTopSessions(sessions, 3)
  const rooms = visibleSessions.map((session) => {
    const events = eventFrames[session.sessionId]
    const latestEvent = events[frame % events.length]

    return buildSessionView(
      {
        ...session,
        updatedAt: latestEvent.timestamp,
      },
      latestEvent,
    )
  })

  return {
    companion: syncCompanion(
      {
        name: 'Siltpaw',
        personality: 'curious guardian with a nose for unfinished tasks',
        hatchedAt: '2026-03-27T08:00:00.000Z',
      },
      Date.parse('2026-04-03T12:30:00.000Z'),
    ),
    rooms,
    feed: rooms.flatMap((room) => (room.latestEvent ? [room.latestEvent] : [])),
    activeCount: rooms.length,
  }
}
