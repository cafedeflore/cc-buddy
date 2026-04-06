import type { PetMood } from './types'

export type AnimationClip =
  | `${PetMood}-to-${PetMood}`
  | 'idle-to-idle-v2'
  | 'idle-to-idle-v3'
  | 'idle-petpet'

export interface AnimationState {
  from: PetMood
  to: PetMood
  clip: AnimationClip
  cycle: number
  isTransition: boolean
  pendingMood: PetMood | null
}

function moodClip(from: PetMood, to: PetMood): AnimationClip {
  return `${from}-to-${to}`
}

function selectIdleLoopClip(randomValue = Math.random()): AnimationClip {
  if (randomValue < 0.8) return 'idle-to-idle'
  if (randomValue < 0.9) return 'idle-to-idle-v2'
  return 'idle-to-idle-v3'
}

export function initialAnimationState(mood: PetMood): AnimationState {
  return {
    from: mood,
    to: mood,
    clip: mood === 'idle' ? selectIdleLoopClip() : moodClip(mood, mood),
    cycle: 0,
    isTransition: false,
    pendingMood: null,
  }
}

export function triggerIdleInteraction(state: AnimationState): AnimationState | null {
  if (state.to !== 'idle' || state.isTransition) {
    return null
  }

  return {
    from: 'idle',
    to: 'idle',
    clip: 'idle-petpet',
    cycle: state.cycle + 1,
    isTransition: true,
    pendingMood: null,
  }
}

export function onMoodChange(state: AnimationState, newMood: PetMood): AnimationState | null {
  const currentTarget = state.pendingMood ?? state.to

  if (currentTarget === newMood) return null

  if (state.isTransition) {
    return { ...state, pendingMood: newMood }
  }

  return {
    from: state.to,
    to: newMood,
    clip: moodClip(state.to, newMood),
    cycle: state.cycle + 1,
    isTransition: true,
    pendingMood: null,
  }
}

export function onVideoEnded(state: AnimationState): AnimationState {
  if (state.isTransition) {
    if (state.pendingMood !== null) {
      return {
        from: state.to,
        to: state.pendingMood,
        clip: moodClip(state.to, state.pendingMood),
        cycle: state.cycle + 1,
        isTransition: true,
        pendingMood: null,
      }
    }

    return {
      from: state.to,
      to: state.to,
      clip: state.to === 'idle' ? selectIdleLoopClip() : moodClip(state.to, state.to),
      cycle: state.cycle + 1,
      isTransition: false,
      pendingMood: null,
    }
  }

  if (state.to === 'idle') {
    return {
      ...state,
      clip: selectIdleLoopClip(),
      cycle: state.cycle + 1,
    }
  }

  return state
}

export function shouldLoopPlayback(state: AnimationState): boolean {
  return !state.isTransition && state.to !== 'idle'
}

export function videoKey(state: AnimationState): string {
  return `${state.cycle}:${state.clip}`
}
