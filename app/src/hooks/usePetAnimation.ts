import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type AnimationState,
  initialAnimationState,
  onMoodChange,
  onVideoEnded,
  shouldLoopPlayback,
  triggerIdleInteraction,
  videoKey,
} from '../domain/animationMachine'
import type { PetMood } from '../domain/types'
import { getVideoUrl } from '../domain/videoPath'

export interface PetAnimationResult {
  videoRef: React.RefObject<HTMLVideoElement | null>
  videoSrc: string
  loop: boolean
  handleEnded: () => void
  triggerPetpet: () => void
}

export function usePetAnimation(mood: PetMood): PetAnimationResult {
  const [animState, setAnimState] = useState<AnimationState>(() => initialAnimationState(mood))
  const [videoSrc, setVideoSrc] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const prevMoodRef = useRef(mood)
  const lastPlaybackKeyRef = useRef<string>('')

  useEffect(() => {
    if (mood === prevMoodRef.current) return
    prevMoodRef.current = mood

    setAnimState((current) => {
      const next = onMoodChange(current, mood)
      return next ?? current
    })
  }, [mood])

  const currentKey = videoKey(animState)
  const shouldLoop = shouldLoopPlayback(animState)

  useEffect(() => {
    let cancelled = false

    getVideoUrl(animState.clip).then((url) => {
      if (cancelled) return
      setVideoSrc(url)
    })

    return () => {
      cancelled = true
    }
  }, [currentKey, animState.clip])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc) return

    const currentSrc = video.getAttribute('src')
    if (currentSrc !== videoSrc || lastPlaybackKeyRef.current !== currentKey) {
      lastPlaybackKeyRef.current = currentKey
      video.src = videoSrc
      video.loop = shouldLoop
      video.load()
      video.play().catch(() => {})
    }
  }, [videoSrc, currentKey, shouldLoop])

  const handleEnded = useCallback(() => {
    setAnimState((current) => onVideoEnded(current))
  }, [])

  const triggerPetpet = useCallback(() => {
    setAnimState((current) => triggerIdleInteraction(current) ?? current)
  }, [])

  return {
    videoRef,
    videoSrc,
    loop: shouldLoop,
    handleEnded,
    triggerPetpet,
  }
}
