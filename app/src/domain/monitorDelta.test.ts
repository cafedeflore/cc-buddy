import { describe, expect, it } from 'vitest'

import { applyMonitorDelta } from './monitorDelta'
import type { MonitorDelta, MonitorSnapshot } from './types'

const snapshot: MonitorSnapshot = {
  companion: {
    name: 'Siltpaw',
    personality: 'curious',
    ageDays: 7,
    hatchedAt: '2026-03-27T08:00:00.000Z',
  },
  activeCount: 2,
  rooms: [
    {
      session: {
        sessionId: 'alpha',
        cwd: 'D:/repo/cc-buddy',
        pid: 100,
        alive: true,
        startedAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:01:00.000Z',
      },
      petState: {
        mood: 'thinking',
        action: 'pondering',
        label: 'Thinking',
        intensity: 'medium',
      },
      latestEvent: {
        type: 'assistant',
        timestamp: '2026-04-04T00:01:00.000Z',
      },
    },
  ],
  feed: [
    {
      type: 'assistant',
      timestamp: '2026-04-04T00:01:00.000Z',
    },
  ],
}

describe('applyMonitorDelta', () => {
  it('replaces visible rooms and appends new feed events', () => {
    const delta: MonitorDelta = {
      activeCount: 3,
      rooms: [
        {
          session: {
            sessionId: 'beta',
            cwd: 'D:/repo/tooling',
            pid: 200,
            alive: true,
            startedAt: '2026-04-04T00:02:00.000Z',
            updatedAt: '2026-04-04T00:03:00.000Z',
          },
          petState: {
            mood: 'focused',
            action: 'writing_code',
            label: 'Editing files',
            intensity: 'high',
          },
          latestEvent: {
            type: 'tool_use',
            timestamp: '2026-04-04T00:03:00.000Z',
            toolName: 'Edit',
          },
        },
      ],
      feedAppend: [
        {
          type: 'tool_use',
          timestamp: '2026-04-04T00:03:00.000Z',
          toolName: 'Edit',
        },
      ],
    }

    expect(applyMonitorDelta(snapshot, delta)).toEqual({
      ...snapshot,
      activeCount: 3,
      rooms: delta.rooms,
      feed: [...snapshot.feed, ...delta.feedAppend],
    })
  })

  it('updates companion data without replacing unchanged sections', () => {
    const delta: MonitorDelta = {
      companion: {
        name: 'Patchpaw',
        personality: 'precise',
        ageDays: 8,
        hatchedAt: '2026-03-27T08:00:00.000Z',
      },
      feedAppend: [],
    }

    const next = applyMonitorDelta(snapshot, delta)

    expect(next.companion.name).toBe('Patchpaw')
    expect(next.rooms).toEqual(snapshot.rooms)
    expect(next.feed).toEqual(snapshot.feed)
  })
})
