import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState } from 'react'

import './App.css'
import { loadSnapshot, subscribeToDeltas } from './bridge/monitor'
import { applyMonitorDelta } from './domain/monitorDelta'
import type { MonitorSnapshot } from './domain/types'

function App() {
  const [frame, setFrame] = useState(0)
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const deferredRooms = useDeferredValue(snapshot?.rooms ?? [])

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

  if (!snapshot) {
    return (
      <main className="shell">
        <section className="workspace">
          <h2>Loading monitor...</h2>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Claude Code Desktop Pet</p>
          <h1>CC Buddy</h1>
          <p className="lede">
            A calm desktop stage that watches local Claude Code sessions and turns
            them into readable companion behavior.
          </p>
          <dl className="metrics" aria-label="Session summary">
            <div>
              <dt>Active sessions</dt>
              <dd>{snapshot.activeCount}</dd>
            </div>
            <div>
              <dt>Companion</dt>
              <dd>{snapshot.companion.name}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{snapshot.companion.ageDays} days</dd>
            </div>
          </dl>
          <p className="support-copy">
            Personality synced from <code>.claude.json</code>: {snapshot.companion.personality}
          </p>
        </div>

        <div className="pet-stage" aria-label="Pet scene preview">
          <div className="stage-glow" />
          {deferredRooms.map((room, index) => (
            <article key={room.session.sessionId} className={`cat cat-${index + 1}`}>
              <div className={`cat-body mood-${room.petState.mood}`}>
                <span className="cat-eye left" />
                <span className="cat-eye right" />
                <span className="cat-mouth" />
              </div>
              <div className="cat-caption">
                <strong>{room.session.sessionId}</strong>
                <span>{room.petState.label}</span>
              </div>
            </article>
          ))}
          <div className="shelf" />
        </div>
      </section>

      <section className="workspace">
        <div className="workspace-header">
          <h2>Live rooms</h2>
          <p>Top three active sessions, ranked by freshest event timestamp.</p>
        </div>
        <div className="room-list">
          {deferredRooms.map((room) => (
            <article key={room.session.sessionId} className="room-row">
              <div>
                <p className="room-name">{room.session.cwd}</p>
                <p className="room-meta">
                  PID {room.session.pid} / {room.petState.mood} / {room.petState.action}
                </p>
              </div>
              <p className="room-detail">{room.latestEvent?.detail ?? room.petState.label}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="feed-section">
        <div className="workspace-header">
          <h2>Event feed</h2>
          <p>Behavior comes from session metadata, JSONL event tails, and companion sync.</p>
        </div>
        {error ? <p className="room-detail">{error}</p> : null}
        <ul className="feed-list">
          {snapshot.feed.map((event) => (
            <li key={`${event.timestamp}-${event.type}`}>
              <span>{event.type}</span>
              <strong>{event.toolName ?? 'session'}</strong>
              <em>{event.detail}</em>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
