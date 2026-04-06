import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type AnimationState,
  initialAnimationState,
  onMoodChange,
  onVideoEnded,
  videoKey,
} from '../domain/animationMachine'
import type { PetMood } from '../domain/types'
import { getVideoUrl } from '../domain/videoPath'

export interface PetAnimationResult {
  /** Ref to attach to the primary <video> element */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Current video source URL */
  videoSrc: string
  /** Whether the video should loop */
  loop: boolean
  /** Call this when the <video> fires 'ended' */
  handleEnded: () => void
}

export function usePetAnimation(mood: PetMood): PetAnimationResult {
  const [animState, setAnimState] = useState<AnimationState>(() => initialAnimationState(mood))
  const [videoSrc, setVideoSrc] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const prevMoodRef = useRef(mood)

  // React to mood changes
  useEffect(() => {
    if (mood === prevMoodRef.current) return
    prevMoodRef.current = mood

    setAnimState((current) => {
      const next = onMoodChange(current, mood)
      return next ?? current
    })
  }, [mood])

  // Resolve video URL when animState changes
  const currentKey = videoKey(animState)

  useEffect(() => {
    let cancelled = false

    getVideoUrl(animState.from, animState.to).then((url) => {
      if (cancelled) return
      setVideoSrc(url)
    })

    return () => { cancelled = true }
  }, [currentKey, animState.from, animState.to])

  // Play the video when src is resolved
  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc) return

    const currentSrc = video.getAttribute('src')
    if (currentSrc !== videoSrc) {
      video.src = videoSrc
      video.loop = !animState.isTransition
      video.load()
      video.play().catch(() => {})
    }
  }, [videoSrc, animState.isTransition])

  const handleEnded = useCallback(() => {
    setAnimState((current) => onVideoEnded(current))
  }, [])

  return {
    videoRef,
    videoSrc,
    loop: !animState.isTransition,
    handleEnded,
  }
}
