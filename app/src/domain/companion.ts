import type { CompanionInput, CompanionState } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function syncCompanion(
  companion: CompanionInput,
  now: number = Date.now(),
): CompanionState {
  const ageDays = Math.max(
    0,
    Math.floor((now - new Date(companion.hatchedAt).getTime()) / DAY_MS),
  )

  return {
    ...companion,
    ageDays,
  }
}
