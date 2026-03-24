import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useAutoplayRetry } from '../useAutoplayRetry'

const { toastInfoKeyMock } = vi.hoisted(() => ({
  toastInfoKeyMock: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    infoKey: toastInfoKeyMock,
    errorKey: vi.fn(),
  },
}))

interface HarnessProps {
  audioUrl: string | null
  isPlaying: boolean
}

function Harness({ audioUrl, isPlaying }: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  useAutoplayRetry({ audioRef, audioUrl, isPlaying })
  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="autoplay-audio" />
}

describe('useAutoplayRetry', () => {
  beforeEach(() => {
    act(() => {
      usePlayerStore.getState().reset()
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('handles browser autoplay block by pausing and showing toast', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue({
      name: 'NotAllowedError',
      message: 'Autoplay blocked',
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    act(() => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
      usePlayerStore.getState().play()
    })

    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(toastInfoKeyMock).toHaveBeenCalledWith('player.autoplayBlocked')
  })

  it('retries once on NotSupportedError after reloading audio element', async () => {
    vi.useFakeTimers()
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce({ name: 'NotSupportedError', message: 'redirect race' })
      .mockResolvedValue(undefined)
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})

    act(() => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
      usePlayerStore.getState().play()
    })

    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    await act(async () => {
      await Promise.resolve()
    })
    expect(loadSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(playSpy).toHaveBeenCalledTimes(2)
  })
})
