import type { TFunction } from 'i18next'
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useSleepTimerStore } from '../../store/sleepTimerStore'
import {
  HIDDEN_PROGRESS_THROTTLE_MS,
  processAudioEndedEvent,
  processAudioErrorEvent,
  processAudioTimeUpdate,
  shouldIgnoreAudioPauseEvent,
  shouldProcessAudioTimeUpdate,
} from '../audioElementEventRuntime'

vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

describe('audioElementEventRuntime', () => {
  beforeEach(() => {
    act(() => {
      usePlayerStore.getState().reset()
      useSleepTimerStore.getState().reset()
    })
    vi.clearAllMocks()
  })

  it('throttles hidden progress updates but not visible ones', () => {
    expect(
      shouldProcessAudioTimeUpdate({
        isVisible: true,
        lastProgressUpdateAt: 100,
        now: 200,
      })
    ).toBe(true)

    expect(
      shouldProcessAudioTimeUpdate({
        isVisible: false,
        lastProgressUpdateAt: 100,
        now: 100 + HIDDEN_PROGRESS_THROTTLE_MS - 1,
      })
    ).toBe(false)
  })

  it('processes timeupdate and records the accepted timestamp', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().play()
    usePlayerStore.getState().setStatus('loading')

    const audio = {
      currentTime: 9,
      paused: false,
      ended: false,
    } as HTMLAudioElement

    const acceptedAt = processAudioTimeUpdate({
      audio,
      isVisible: false,
      lastProgressUpdateAt: 0,
      now: HIDDEN_PROGRESS_THROTTLE_MS,
    })

    expect(acceptedAt).toBe(HIDDEN_PROGRESS_THROTTLE_MS)
    expect(usePlayerStore.getState().progress).toBe(9)
    expect(usePlayerStore.getState().status).toBe('playing')
  })

  it('handles ended semantics and resets end-of-episode sleep timer', async () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().play()
    useSleepTimerStore.getState().startEndOfEpisode()

    const audio = {
      duration: 42,
      currentTime: 12,
    } as HTMLAudioElement

    await processAudioEndedEvent(audio)

    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(usePlayerStore.getState().progress).toBe(42)
    expect(useSleepTimerStore.getState().isEndOfEpisode).toBe(false)
  })

  it('suppresses pause/error handling during recovery and reports normal errors otherwise', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().play()

    expect(shouldIgnoreAudioPauseEvent(true)).toBe(true)

    const audio = {
      src: 'https://example.com/audio.mp3',
      error: {
        code: 2,
        message: 'network down',
      } as MediaError,
    } as HTMLAudioElement

    expect(
      processAudioErrorEvent({
        audio,
        isRecovering: true,
        t: ((key: string) => key) as unknown as TFunction,
      })
    ).toBe(false)

    expect(
      processAudioErrorEvent({
        audio,
        isRecovering: false,
        t: ((key: string) => key) as unknown as TFunction,
      })
    ).toBe(true)
    expect(usePlayerStore.getState().status).toBe('error')
  })
})
