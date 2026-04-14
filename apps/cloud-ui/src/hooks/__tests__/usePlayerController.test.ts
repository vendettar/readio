import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { usePlayerController } from '../usePlayerController'

function resetStore() {
  usePlayerStore.getState().reset()
  useTranscriptStore.getState().resetTranscript()
  usePlayerStore.setState({
    audioLoaded: true,
    duration: 120,
    progress: 50,
    playbackRate: 1,
  })
}

describe('usePlayerController', () => {
  beforeEach(() => {
    resetStore()
  })

  it('skipBackward clamps at 0', () => {
    const { result } = renderHook(() => usePlayerController())

    act(() => {
      usePlayerStore.setState({ progress: 5 })
      result.current.skipBackward()
    })

    expect(usePlayerStore.getState().pendingSeek).toBe(0)
  })

  it('skipForward clamps to duration and no-ops when duration not ready', () => {
    const { result } = renderHook(() => usePlayerController())

    act(() => {
      usePlayerStore.setState({ progress: 118, duration: 120 })
      result.current.skipForward()
    })
    expect(usePlayerStore.getState().pendingSeek).toBe(120)

    act(() => {
      usePlayerStore.setState({ pendingSeek: null, progress: 10, duration: 0 })
      result.current.skipForward()
    })
    expect(usePlayerStore.getState().pendingSeek).toBeNull()
  })

  it('prevSmart/nextSmart prefer subtitle neighbors and fallback to skip', () => {
    const { result } = renderHook(() => usePlayerController())

    act(() => {
      useTranscriptStore.setState({
        subtitles: [
          { start: 10, end: 20, text: 'a' },
          { start: 30, end: 40, text: 'b' },
          { start: 50, end: 60, text: 'c' },
        ],
        currentIndex: 1,
      })
      result.current.prevSmart()
    })
    expect(usePlayerStore.getState().pendingSeek).toBe(10)

    act(() => {
      usePlayerStore.setState({ pendingSeek: null })
      useTranscriptStore.setState({ currentIndex: 1 })
      result.current.nextSmart()
    })
    expect(usePlayerStore.getState().pendingSeek).toBe(50)

    act(() => {
      usePlayerStore.setState({ pendingSeek: null, progress: 20 })
      useTranscriptStore.setState({ subtitles: [], currentIndex: -1 })
      result.current.prevSmart()
    })
    expect(usePlayerStore.getState().pendingSeek).toBe(10)
  })

  it('jumpToSubtitle guards out-of-range indices', () => {
    const { result } = renderHook(() => usePlayerController())

    act(() => {
      useTranscriptStore.setState({
        subtitles: [{ start: 12, end: 20, text: 'a' }],
      })
      result.current.jumpToSubtitle(0)
    })
    expect(usePlayerStore.getState().pendingSeek).toBe(12)

    act(() => {
      usePlayerStore.setState({ pendingSeek: null })
      useTranscriptStore.setState({ subtitles: [] })
      result.current.jumpToSubtitle(99)
    })
    expect(usePlayerStore.getState().pendingSeek).toBeNull()
  })

  it('cycles playback rate and normalizes unknown values to 1.0', () => {
    const { result } = renderHook(() => usePlayerController())

    act(() => {
      usePlayerStore.setState({ playbackRate: 1 })
      result.current.cyclePlaybackRate()
    })
    expect(usePlayerStore.getState().playbackRate).toBe(1.25)

    act(() => {
      usePlayerStore.setState({ playbackRate: 3.7 })
      result.current.cyclePlaybackRate()
    })
    expect(usePlayerStore.getState().playbackRate).toBe(1)
  })
})
