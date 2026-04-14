import { act, fireEvent, render, waitFor } from '@testing-library/react'
import type { TFunction } from 'i18next'
import { useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaybackRepository } from '../../lib/repositories/PlaybackRepository'
import { usePlayerStore } from '../../store/playerStore'
import { useSleepTimerStore } from '../../store/sleepTimerStore'
import { useAudioElementEvents } from '../useAudioElementEvents'

vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

vi.mock('../../lib/repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    updatePlaybackSession: vi.fn().mockResolvedValue(undefined),
  },
}))

interface HarnessProps {
  t: TFunction
  onPlay?: () => void
  onPause?: () => void
  onLoadedMetadata?: () => void
  isVisible?: boolean
}

function Harness({
  t,
  onPlay = vi.fn(),
  onPause = vi.fn(),
  onLoadedMetadata = vi.fn(),
  isVisible = true,
}: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const isVisibleRef = useRef(isVisible)
  const lastProgressUpdateRef = useRef(0)

  useAudioElementEvents({
    audioRef,
    isVisibleRef,
    lastProgressUpdateRef,
    onPlay,
    onPause,
    onLoadedMetadata,
    t,
  })

  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="audio-events-target" />
}

describe('useAudioElementEvents', () => {
  beforeEach(() => {
    act(() => {
      usePlayerStore.getState().reset()
      useSleepTimerStore.getState().reset()
    })
    vi.clearAllMocks()
  })

  it('updates progress and recovers loading to playing on timeupdate', async () => {
    const { getByTestId } = render(<Harness t={((key: string) => key) as unknown as TFunction} />)
    const audio = getByTestId('audio-events-target') as HTMLAudioElement

    act(() => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
      usePlayerStore.getState().play()
      usePlayerStore.getState().setStatus('loading')
    })

    Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => 9 })
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => false })
    Object.defineProperty(audio, 'ended', { configurable: true, get: () => false })

    await act(async () => {
      fireEvent.timeUpdate(audio)
    })

    expect(usePlayerStore.getState().progress).toBe(9)
    expect(usePlayerStore.getState().status).toBe('playing')
  })

  it('handles ended and error events with existing store semantics', async () => {
    const { getByTestId } = render(<Harness t={((key: string) => key) as unknown as TFunction} />)
    const audio = getByTestId('audio-events-target') as HTMLAudioElement

    act(() => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
      usePlayerStore.getState().play()
      useSleepTimerStore.getState().startEndOfEpisode()
    })

    Object.defineProperty(audio, 'duration', { configurable: true, get: () => 42 })
    await act(async () => {
      fireEvent.ended(audio)
    })
    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(usePlayerStore.getState().progress).toBe(42)
    expect(useSleepTimerStore.getState().isEndOfEpisode).toBe(false)

    Object.defineProperty(audio, 'error', {
      configurable: true,
      get: () =>
        ({
          code: 2,
          message: 'network down',
        }) as MediaError,
    })
    await act(async () => {
      fireEvent.error(audio)
    })
    expect(usePlayerStore.getState().status).toBe('error')
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })

  it('persists ended session as completed progress=0 to prevent tail resume', async () => {
    const { getByTestId } = render(<Harness t={((key: string) => key) as unknown as TFunction} />)
    const audio = getByTestId('audio-events-target') as HTMLAudioElement

    act(() => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
      usePlayerStore.getState().setSessionId('session-ended-reset')
      usePlayerStore.getState().setDuration(42)
      usePlayerStore.getState().play()
    })

    Object.defineProperty(audio, 'duration', { configurable: true, get: () => 42 })
    await act(async () => {
      fireEvent.ended(audio)
    })

    await waitFor(() => {
      expect(PlaybackRepository.updatePlaybackSession).toHaveBeenCalledWith('session-ended-reset', {
        progress: 0,
        durationSeconds: 42,
      })
    })
    expect(PlaybackRepository.updatePlaybackSession).toHaveBeenCalledTimes(1)
    expect(PlaybackRepository.updatePlaybackSession).not.toHaveBeenCalledWith(
      'session-ended-reset',
      expect.objectContaining({ progress: 42 })
    )
  })
})
