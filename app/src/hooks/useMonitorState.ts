import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { loadSnapshot, subscribeToDeltas } from '../bridge/monitor'
import { applyMonitorDelta } from '../domain/monitorDelta'
import type { MonitorSnapshot } from '../domain/types'

export function useMonitorState() {
  const [frame, setFrame] = useState(0)
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tick = useEffectEvent(() => {
    startTransition(() => {
      setFrame((value) => value + 1)
    })
  })

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | null = null
    let timer: number | null = null

    void (async () => {
      cleanup = await subscribeToDeltas((delta) => {
        if (!disposed) {
          setSnapshot((current) => (current ? applyMonitorDelta(current, delta) : current))
          setError(null)
        }
      })

      if (!cleanup) {
        timer = window.setInterval(() => {
          tick()
        }, 2400)
      }
    })()

    return () => {
      disposed = true
      cleanup?.()
      if (timer !== null) {
        window.clearInterval(timer)
      }
    }
  }, [])

  const refreshSnapshot = useEffectEvent(async (currentFrame: number) => {
    try {
      const nextSnapshot = await loadSnapshot(currentFrame)
      setSnapshot(nextSnapshot)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unknown monitor error')
    }
  })

  useEffect(() => {
    void refreshSnapshot(frame)
  }, [frame])

  return { snapshot, error }
}
