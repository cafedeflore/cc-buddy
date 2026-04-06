import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

import './PetWindow.css'
import { selectPrimaryRoom } from './domain/monitor'
import { useMonitorState } from './hooks/useMonitorState'
import { usePetAnimation } from './hooks/usePetAnimation'
import type { PetMood } from './domain/types'

function PetWindow() {
  const { snapshot } = useMonitorState()
  const [hovered, setHovered] = useState(false)
  const [visibleLabel, setVisibleLabel] = useState('')
  const [bubbleFading, setBubbleFading] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const dragTriggeredRef = useRef(false)

  const room = selectPrimaryRoom(snapshot?.rooms ?? [])
  const currentMood: PetMood = room?.petState.mood ?? 'idle'
  const label = room?.latestEvent?.detail ?? room?.petState.label ?? ''

  useEffect(() => {
    if (!label) {
      setVisibleLabel('')
      setBubbleFading(false)
      return
    }
    setVisibleLabel(label)
    setBubbleFading(false)
    const fadeTimer = setTimeout(() => setBubbleFading(true), 2600)
    const hideTimer = setTimeout(() => {
      setVisibleLabel('')
      setBubbleFading(false)
    }, 3000)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [label])

  const {
    videoRef,
    videoSrc,
    loop: shouldLoop,
    handleEnded,
    triggerPetpet,
  } = usePetAnimation(currentMood)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  const handleStageMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return
    }

    dragStartRef.current = { x: e.clientX, y: e.clientY }
    dragTriggeredRef.current = false
    suppressClickRef.current = false
  }, [])

  const handleStageMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.buttons & 1) !== 1 || !dragStartRef.current || dragTriggeredRef.current) {
      return
    }

    const deltaX = Math.abs(e.clientX - dragStartRef.current.x)
    const deltaY = Math.abs(e.clientY - dragStartRef.current.y)
    if (Math.max(deltaX, deltaY) < 8) {
      return
    }

    dragTriggeredRef.current = true
    suppressClickRef.current = true
    void getCurrentWindow().startDragging()
  }, [])

  const handleStagePointerReset = useCallback(() => {
    dragStartRef.current = null
  }, [])

  const handleStageClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }

    if (currentMood !== 'idle') {
      return
    }

    triggerPetpet()
  }, [currentMood, triggerPetpet])

  return (
    <div
      data-testid="pet-window"
      className={`pet-window${hovered ? ' pet-window--hovered' : ''}`}
      data-tauri-drag-region
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="pet-bubble-area" data-testid="pet-bubble-area" data-tauri-drag-region>
        {visibleLabel && (
          <div className={`pet-bubble${bubbleFading ? ' pet-bubble--fading' : ''}`}>
            <span className="pet-bubble-text">{visibleLabel}</span>
          </div>
        )}
      </div>
      <div className="pet-stage-shell" data-testid="pet-stage-shell" data-tauri-drag-region>
        <div
          className="pet-stage-square"
          data-testid="pet-stage-square"
          data-tauri-drag-region
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStagePointerReset}
          onMouseLeave={handleStagePointerReset}
          onClick={handleStageClick}
        >
          <div className="pet-circle-backdrop" data-testid="pet-circle-backdrop" />
          <video
            ref={videoRef}
            className="pet-video"
            src={videoSrc}
            autoPlay
            muted
            loop={shouldLoop}
            playsInline
            onEnded={handleEnded}
          />
        </div>
      </div>
    </div>
  )
}

export default PetWindow
