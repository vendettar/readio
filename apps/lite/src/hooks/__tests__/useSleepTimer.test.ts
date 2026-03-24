import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSleepTimerStore } from '../../store/sleepTimerStore'
import { useSleepTimer } from '../useSleepTimer'

describe('useSleepTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    act(() => {
      useSleepTimerStore.getState().reset()
    })
  })

  afterEach(() => {
    act(() => {
      useSleepTimerStore.getState().reset()
    })
    vi.useRealTimers()
  })

  it('reflects store state and actions', () => {
    const { result } = renderHook(() => useSleepTimer())

    expect(result.current.isActive).toBe(false)

    act(() => {
      result.current.startTimer(15)
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.remainingSeconds).toBe(900)

    act(() => {
      result.current.cancelTimer()
    })

    expect(result.current.isActive).toBe(false)
  })

  it('handles end of episode mode', () => {
    const { result } = renderHook(() => useSleepTimer())

    act(() => {
      result.current.startEndOfEpisode()
    })

    expect(result.current.isEndOfEpisode).toBe(true)
    expect(result.current.isActive).toBe(true)
  })
})
