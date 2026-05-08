import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelSelectionInteraction,
  prepareSelectionInteraction,
} from '../selectionInteractionRuntime'

const { isPlayerCurrentlyPlayingMock, pausePlayerIfActiveMock, resumePlayerIfNeededMock } =
  vi.hoisted(() => ({
    isPlayerCurrentlyPlayingMock: vi.fn(),
    pausePlayerIfActiveMock: vi.fn(),
    resumePlayerIfNeededMock: vi.fn(),
  }))

vi.mock('../../../lib/player/playerInteractionRuntime', () => ({
  isPlayerCurrentlyPlaying: isPlayerCurrentlyPlayingMock,
  pausePlayerIfActive: pausePlayerIfActiveMock,
  resumePlayerIfNeeded: resumePlayerIfNeededMock,
}))

describe('selectionInteractionRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules player pause only when playback is active', () => {
    isPlayerCurrentlyPlayingMock.mockReturnValue(true)
    const refs = {
      interactionSequenceRef: { current: 0 },
      wasPlayingBeforeInteractionRef: { current: false },
    }

    prepareSelectionInteraction(refs)
    vi.advanceTimersByTime(0)

    expect(refs.wasPlayingBeforeInteractionRef.current).toBe(true)
    expect(pausePlayerIfActiveMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates pending pause and resumes unless the close reason is switch', () => {
    isPlayerCurrentlyPlayingMock.mockReturnValue(true)
    const refs = {
      interactionSequenceRef: { current: 0 },
      wasPlayingBeforeInteractionRef: { current: false },
    }

    prepareSelectionInteraction(refs)
    cancelSelectionInteraction(refs)
    vi.advanceTimersByTime(0)

    expect(pausePlayerIfActiveMock).not.toHaveBeenCalled()
    expect(resumePlayerIfNeededMock).toHaveBeenCalledWith(true)
    expect(refs.wasPlayingBeforeInteractionRef.current).toBe(false)
  })

  it('skips playback resumption when switching surfaces', () => {
    const refs = {
      interactionSequenceRef: { current: 0 },
      wasPlayingBeforeInteractionRef: { current: true },
    }

    cancelSelectionInteraction(refs, { reason: 'switch' })

    expect(resumePlayerIfNeededMock).not.toHaveBeenCalled()
    expect(refs.wasPlayingBeforeInteractionRef.current).toBe(false)
  })
})
