import type { AnimationClip } from './animationMachine'
import type { PetMood } from './types'

/** All 9 moods for preloading */
export const ALL_MOODS: PetMood[] = [
  'idle', 'thinking', 'excited', 'focused',
  'curious', 'hunting', 'busy', 'happy', 'worried',
]

const isTauriProd = window.__TAURI_INTERNALS__ &&
  (location.protocol === 'tauri:' || location.protocol === 'https:' && location.host === 'tauri.localhost')

let assetBase: Promise<string> | null = null

async function resolveAssetBase(): Promise<string> {
  if (!isTauriProd) return '/videos'

  const { resolveResource } = await import('@tauri-apps/api/path')
  const { convertFileSrc } = await import('@tauri-apps/api/core')
  const resourcePath = await resolveResource('resources/videos')
  return convertFileSrc(resourcePath)
}

export function clipFileName(clip: AnimationClip): string {
  return `${clip}.webm`
}

export async function getVideoUrl(clip: AnimationClip): Promise<string> {
  if (!assetBase) assetBase = resolveAssetBase()
  const base = await assetBase
  return `${base}/${clipFileName(clip)}`
}
