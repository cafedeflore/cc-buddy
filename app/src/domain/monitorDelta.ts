import type { MonitorDelta, MonitorSnapshot } from './types'

export function applyMonitorDelta(
  snapshot: MonitorSnapshot,
  delta: MonitorDelta,
): MonitorSnapshot {
  return {
    companion: delta.companion ?? snapshot.companion,
    activeCount: delta.activeCount ?? snapshot.activeCount,
    rooms: delta.rooms ?? snapshot.rooms,
    feed: [...snapshot.feed, ...delta.feedAppend],
  }
}
