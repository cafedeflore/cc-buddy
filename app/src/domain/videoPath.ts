import type { AnimationClip } from './animationMachine'
import type { PetMood } from './types'

/** All 9 moods for preloading */
export const ALL_MOODS: PetMood[] = [
  'idle', 'thinking', 'excited', 'focused',
  'curious', 'hunting', 'busy', 'happy', 'worried',
]

export function clipFileName(clip: AnimationClip): string {
  return `${clip}.webm`
}

export function publicVideoPathForClip(clip: AnimationClip): string {
  return `/videos/${clipFileName(clip)}`
}

export async function getVideoUrl(clip: AnimationClip): Promise<string> {
  return publicVideoPathForClip(clip)
}
