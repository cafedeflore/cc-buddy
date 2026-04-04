import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadSnapshot, subscribeToDeltas, subscribeToSnapshots } from './monitor'

describe('loadSnapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to demo mode when Tauri invoke is unavailable', async () => {
    const snapshot = await loadSnapshot(2)

    expect(snapshot.activeCount).toBe(3)
    expect(snapshot.companion.name).toBe('Siltpaw')
  })

  it('uses the injected Tauri invoke bridge when available', async () => {
    const invoke = vi.fn().mockResolvedValue({
      activeCount: 1,
      companion: {
        name: 'Patchpaw',
        personality: 'precise',
        ageDays: 5,
        hatchedAt: '2026-03-29T00:00:00.000Z',
      },
      rooms: [],
      feed: [],
    })

    vi.stubGlobal('__TAURI_INTERNALS__', { invoke })

    const snapshot = await loadSnapshot(0)

    expect(invoke).toHaveBeenCalledWith('monitor_snapshot')
    expect(snapshot.companion.name).toBe('Patchpaw')
  })

  it('subscribes to Tauri monitor events when an event bridge is available', async () => {
    const unlisten = vi.fn()
    const listen = vi.fn().mockResolvedValue(unlisten)
    const callback = vi.fn()

    vi.stubGlobal('__TAURI_INTERNALS__', {
      invoke: vi.fn(),
      event: { listen },
    })

    const dispose = await subscribeToSnapshots(callback)

    expect(listen).toHaveBeenCalledWith('monitor-snapshot', expect.any(Function))

    const handler = listen.mock.calls[0]?.[1] as ((event: { payload: unknown }) => void)
    handler({
      payload: {
        activeCount: 2,
        companion: {
          name: 'Siltpaw',
          personality: 'alert',
          ageDays: 8,
          hatchedAt: '2026-03-27T08:00:00.000Z',
        },
        rooms: [],
        feed: [],
      },
    })

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        activeCount: 2,
      }),
    )

    expect(dispose).not.toBeNull()
    dispose?.()
    expect(unlisten).toHaveBeenCalled()
  })

  it('subscribes to monitor deltas when the delta bridge is available', async () => {
    const unlisten = vi.fn()
    const listen = vi.fn().mockResolvedValue(unlisten)
    const callback = vi.fn()

    vi.stubGlobal('__TAURI_INTERNALS__', {
      invoke: vi.fn(),
      event: { listen },
    })

    const dispose = await subscribeToDeltas(callback)

    expect(listen).toHaveBeenCalledWith('monitor-delta', expect.any(Function))
    dispose?.()
    expect(unlisten).toHaveBeenCalled()
  })
})
