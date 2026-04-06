import type { PetMood } from './types'

export interface AnimationState {
  /** Video currently playing */
  from: PetMood
  to: PetMood
  /** True when playing a transition (one-shot), false when looping */
  isTransition: boolean
  /** Mood change queued while a transition is playing */
  pendingMood: PetMood | null
}

export function initialAnimationState(mood: PetMood): AnimationState {
  return { from: mood, to: mood, isTransition: false, pendingMood: null }
}

/**
 * Called when the monitored mood changes.
 * Returns a new state, or null if nothing should change.
 */
export function onMoodChange(state: AnimationState, newMood: PetMood): AnimationState | null {
  const currentTarget = state.pendingMood ?? state.to

  // Already heading to this mood — ignore
  if (currentTarget === newMood) return null

  if (state.isTransition) {
    // A transition is playing — queue the new mood
    return { ...state, pendingMood: newMood }
  }

  // Currently looping — start transition immediately
  return {
    from: state.to,
    to: newMood,
    isTransition: true,
    pendingMood: null,
  }
}

/**
 * Called when the current video ends.
 * Returns the next state to play.
 */
export function onVideoEnded(state: AnimationState): AnimationState {
  if (state.isTransition) {
    // Transition finished
    if (state.pendingMood !== null) {
      // Another mood change was queued — play that transition next
      return {
        from: state.to,
        to: state.pendingMood,
        isTransition: true,
        pendingMood: null,
      }
    }
    // No pending — start looping the destination mood
    return {
      from: state.to,
      to: state.to,
      isTransition: false,
      pendingMood: null,
    }
  }

  // Loop video ended — replay (same state, caller will loop)
  return state
}

export function videoKey(state: AnimationState): string {
  return `${state.from}-to-${state.to}`
}
