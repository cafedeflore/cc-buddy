import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PetWindow from './PetWindow'
import type { MonitorSnapshot, SessionRoom } from './domain/types'

const startDragging = vi.fn()
const triggerPetpet = vi.fn()
let mockSnapshot: MonitorSnapshot = createSnapshot()

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    startDragging,
  }),
}))

vi.mock('./hooks/useMonitorState', () => ({
  useMonitorState: () => ({
    snapshot: mockSnapshot,
  }),
}))

vi.mock('./hooks/usePetAnimation', () => ({
  usePetAnimation: () => ({
    videoRef: { current: null },
    videoSrc: '/idle-to-idle.webm',
    loop: true,
    handleEnded: vi.fn(),
    triggerPetpet,
  }),
}))

beforeEach(() => {
  mockSnapshot = createSnapshot()
})

afterEach(() => {
  cleanup()
  startDragging.mockReset()
  triggerPetpet.mockReset()
})

describe('PetWindow', () => {
  it('renders a separate bubble area and square pet stage shell', () => {
    render(<PetWindow />)

    expect(screen.getByTestId('pet-bubble-area')).toBeInTheDocument()
    expect(screen.getByTestId('pet-stage-shell')).toBeInTheDocument()
    expect(screen.getByTestId('pet-stage-square')).toBeInTheDocument()
    expect(screen.getByTestId('pet-circle-backdrop')).toBeInTheDocument()
    expect(screen.getByText('Ready to help')).toBeInTheDocument()
  })

  it('shows the resize border when hovered', () => {
    const { getByTestId } = render(<PetWindow />)

    const windowRoot = getByTestId('pet-window')
    fireEvent.mouseEnter(windowRoot)

    expect(windowRoot).toHaveClass('pet-window--hovered')
  })

  it('triggers petpet on idle click without starting drag', () => {
    render(<PetWindow />)

    fireEvent.mouseDown(screen.getByTestId('pet-stage-square'), {
      button: 0,
      clientX: 10,
      clientY: 10,
    })
    fireEvent.mouseUp(screen.getByTestId('pet-stage-square'), {
      button: 0,
      clientX: 10,
      clientY: 10,
    })
    fireEvent.click(screen.getByTestId('pet-stage-square'))

    expect(triggerPetpet).toHaveBeenCalledTimes(1)
    expect(startDragging).not.toHaveBeenCalled()
  })

  it('does not trigger petpet when the current mood is not idle', () => {
    mockSnapshot = createSnapshot([
      createRoom({
        sessionId: 'thinking-room',
        updatedAt: '2026-04-06T00:00:10.000Z',
        mood: 'thinking',
        label: 'Thinking hard',
      }),
    ])

    render(<PetWindow />)
    fireEvent.click(screen.getByTestId('pet-stage-square'))

    expect(triggerPetpet).not.toHaveBeenCalled()
  })

  it('starts dragging after pointer movement passes the threshold', () => {
    render(<PetWindow />)

    fireEvent.mouseDown(screen.getByTestId('pet-stage-square'), {
      button: 0,
      clientX: 10,
      clientY: 10,
    })
    fireEvent.mouseMove(screen.getByTestId('pet-stage-square'), {
      buttons: 1,
      clientX: 24,
      clientY: 24,
    })

    expect(startDragging).toHaveBeenCalledTimes(1)
  })

  it('uses the freshest live room detail for the bubble text', async () => {
    mockSnapshot = createSnapshot([
      createRoom({
        sessionId: 'older-room',
        updatedAt: '2026-04-06T00:00:00.000Z',
        detail: 'Older room detail',
      }),
      createRoom({
        sessionId: 'newer-room',
        updatedAt: '2026-04-06T00:00:10.000Z',
        detail: 'Newest live room detail',
      }),
    ])

    render(<PetWindow />)

    expect(await screen.findByText('Newest live room detail')).toBeInTheDocument()
    expect(screen.queryByText('Older room detail')).not.toBeInTheDocument()
  })
})

function createSnapshot(rooms: SessionRoom[] = [createRoom()]): MonitorSnapshot {
  return {
    companion: {
      name: 'Siltpaw',
      personality: 'calm',
      hatchedAt: '2026-03-27T08:00:00.000Z',
      ageDays: 10,
    },
    rooms,
    feed: [],
    activeCount: rooms.length,
  }
}

function createRoom({
  sessionId = 'room-1',
  updatedAt = '2026-04-06T00:00:00.000Z',
  detail,
  mood = 'idle',
  label = 'Ready to help',
}: {
  sessionId?: string
  updatedAt?: string
  detail?: string
  mood?: SessionRoom['petState']['mood']
  label?: string
} = {}): SessionRoom {
  return {
    session: {
      sessionId,
      cwd: `D:\\repo\\${sessionId}`,
      pid: 1234,
      alive: true,
      startedAt: '2026-04-06T00:00:00.000Z',
      updatedAt,
    },
    latestEvent: detail
      ? {
          type: 'assistant',
          timestamp: updatedAt,
          detail,
        }
      : undefined,
    petState: {
      mood,
      action: 'sleeping',
      label,
      intensity: 'low',
    },
  }
}
