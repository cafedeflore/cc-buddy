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

  // Dynamic import to avoid bundling issues in dev
  const { resolveResource } = await import('@tauri-apps/api/path')
  const { convertFileSrc } = await import('@tauri-apps/api/core')
  const resourcePath = await resolveResource('resources/videos')
  return convertFileSrc(resourcePath)
}

/**
 * Resolve the URL for a state-transition video.
 *
 * Dev mode: served by Vite middleware at /videos/*.
 * Tauri production: uses asset protocol with resolved resource path.
 */
export async function getVideoUrl(from: PetMood, to: PetMood): Promise<string> {
  if (!assetBase) assetBase = resolveAssetBase()
  const base = await assetBase
  return `${base}/${from}-to-${to}.webm`
}
