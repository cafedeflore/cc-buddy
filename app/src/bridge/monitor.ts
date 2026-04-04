import type { MonitorDelta, MonitorSnapshot } from '../domain/types'
import { createDemoSnapshot } from '../mocks/demo'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<MonitorSnapshot>
      event?: {
        listen: (
          event: string,
          handler: (event: { payload: MonitorSnapshot | MonitorDelta }) => void,
        ) => Promise<() => void>
      }
    }
  }
}

export async function loadSnapshot(frame: number): Promise<MonitorSnapshot> {
  const invoke = window.__TAURI_INTERNALS__?.invoke

  if (!invoke) {
    return createDemoSnapshot(frame)
  }

  return invoke('monitor_snapshot')
}

export async function subscribeToSnapshots(
  onSnapshot: (snapshot: MonitorSnapshot) => void,
): Promise<(() => void) | null> {
  const listen = window.__TAURI_INTERNALS__?.event?.listen

  if (!listen) {
    return null
  }

  const unlisten = await listen('monitor-snapshot', (event) => {
    onSnapshot(event.payload as MonitorSnapshot)
  })

  return () => {
    unlisten()
  }
}

export async function subscribeToDeltas(
  onDelta: (delta: MonitorDelta) => void,
): Promise<(() => void) | null> {
  const listen = window.__TAURI_INTERNALS__?.event?.listen

  if (!listen) {
    return null
  }

  const unlisten = await listen('monitor-delta', (event) => {
    onDelta(event.payload as MonitorDelta)
  })

  return () => {
    unlisten()
  }
}
