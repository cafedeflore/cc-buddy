import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PetWindow from './PetWindow'
import type { MonitorSnapshot, SessionRoom } from './domain/types'

const startDragging = vi.fn()
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
  }),
}))

beforeEach(() => {
  mockSnapshot = createSnapshot()
})

afterEach(() => {
  cleanup()
  startDragging.mockReset()
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

  it('starts dragging when the pet stage is pressed', () => {
    render(<PetWindow />)

    fireEvent.mouseDown(screen.getByTestId('pet-stage-square'), { button: 0 })

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
}: {
  sessionId?: string
  updatedAt?: string
  detail?: string
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
      mood: 'idle',
      action: 'sleeping',
      label: 'Ready to help',
      intensity: 'low',
    },
  }
}
