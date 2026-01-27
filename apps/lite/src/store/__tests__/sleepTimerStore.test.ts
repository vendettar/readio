import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../playerStore'
import { useSleepTimerStore } from '../sleepTimerStore'

describe('sleepTimerStore', () => {
  beforeEach(() => {
    act(() => {
      useSleepTimerStore.getState().reset()
      usePlayerStore.getState().reset()
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      useSleepTimerStore.getState().reset()
    })
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('counts down and pauses playback', () => {
    const pauseSpy = vi.spyOn(usePlayerStore.getState(), 'pause')

    act(() => {
      useSleepTimerStore.getState().startTimer(1) // 1 minute
    })

    expect(useSleepTimerStore.getState().remainingSeconds).toBe(60)

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(useSleepTimerStore.getState().remainingSeconds).toBe(30)

    act(() => {
      vi.advanceTimersByTime(31000)
    })

    expect(useSleepTimerStore.getState().remainingSeconds).toBe(null)
    expect(pauseSpy).toHaveBeenCalled()
  })

  it('cancels active timer', () => {
    act(() => {
      useSleepTimerStore.getState().startTimer(15)
    })
    expect(useSleepTimerStore.getState().remainingSeconds).toBe(900)

    act(() => {
      useSleepTimerStore.getState().cancelTimer()
    })

    expect(useSleepTimerStore.getState().remainingSeconds).toBe(null)

    // Ensure ticker stopped
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(useSleepTimerStore.getState().remainingSeconds).toBe(null)
  })

  it('handles end of episode mode without a ticker', () => {
    act(() => {
      useSleepTimerStore.getState().startEndOfEpisode()
    })

    expect(useSleepTimerStore.getState().isEndOfEpisode).toBe(true)
    expect(useSleepTimerStore.getState().remainingSeconds).toBe(null)

    // Ensure no ticker is running
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(useSleepTimerStore.getState().remainingSeconds).toBe(null)
  })
})
