import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  initialAnimationState,
  onMoodChange,
  onVideoEnded,
  shouldLoopPlayback,
  triggerIdleInteraction,
  videoKey,
} from './animationMachine'

describe('animationMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('picks the default idle loop for random values below 0.8', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)

    const next = onVideoEnded({
      from: 'thinking',
      to: 'idle',
      clip: 'thinking-to-idle',
      cycle: 0,
      isTransition: true,
      pendingMood: null,
    })

    expect(next.clip).toBe('idle-to-idle')
    expect(next.isTransition).toBe(false)
  })

  it('picks idle-to-idle-v2 for random values from 0.8 to below 0.9', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.85)

    const next = onVideoEnded({
      from: 'thinking',
      to: 'idle',
      clip: 'thinking-to-idle',
      cycle: 0,
      isTransition: true,
      pendingMood: null,
    })

    expect(next.clip).toBe('idle-to-idle-v2')
  })

  it('picks idle-to-idle-v3 for random values from 0.9 upward', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95)

    const next = onVideoEnded({
      from: 'thinking',
      to: 'idle',
      clip: 'thinking-to-idle',
      cycle: 0,
      isTransition: true,
      pendingMood: null,
    })

    expect(next.clip).toBe('idle-to-idle-v3')
  })

  it('starts idle petting only from an idle loop', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)

    const idleState = initialAnimationState('idle')
    const activeState = onMoodChange(idleState, 'thinking')!

    expect(triggerIdleInteraction(idleState)?.clip).toBe('idle-petpet')
    expect(triggerIdleInteraction(activeState)).toBeNull()
  })

  it('returns to a fresh idle loop after idle-petpet ends', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.85)

    const next = onVideoEnded({
      from: 'idle',
      to: 'idle',
      clip: 'idle-petpet',
      cycle: 1,
      isTransition: true,
      pendingMood: null,
    })

    expect(next.clip).toBe('idle-to-idle-v2')
    expect(next.isTransition).toBe(false)
    expect(next.to).toBe('idle')
  })

  it('reselects an idle loop variant after each idle cycle ends', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.85)
      .mockReturnValueOnce(0.2)

    const current = initialAnimationState('idle')
    const next = onVideoEnded(current)

    expect(current.clip).toBe('idle-to-idle-v2')
    expect(next.clip).toBe('idle-to-idle')
    expect(next.isTransition).toBe(false)
  })

  it('changes the playback key even when idle picks the same clip twice', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.2)

    const current = initialAnimationState('idle')
    const next = onVideoEnded(current)

    expect(current.clip).toBe('idle-to-idle')
    expect(next.clip).toBe('idle-to-idle')
    expect(videoKey(next)).not.toBe(videoKey(current))
  })

  it('disables native looping for idle self-loop clips', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)

    const idleState = initialAnimationState('idle')
    const thinkingState = initialAnimationState('thinking')

    expect(shouldLoopPlayback(idleState)).toBe(false)
    expect(shouldLoopPlayback(thinkingState)).toBe(true)
  })
})
