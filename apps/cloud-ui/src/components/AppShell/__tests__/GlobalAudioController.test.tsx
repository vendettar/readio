// src/components/AppShell/__tests__/GlobalAudioController.test.tsx
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import { GlobalAudioController } from '../GlobalAudioController'

const { useMediaSessionMock } = vi.hoisted(() => ({ useMediaSessionMock: vi.fn() }))
const { prevSmartSpy, nextSmartSpy } = vi.hoisted(() => ({
  prevSmartSpy: vi.fn(),
  nextSmartSpy: vi.fn(),
}))

vi.mock('../../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

// Mock dependencies
vi.mock('../../../hooks/useImageObjectUrl', () => ({ useImageObjectUrl: () => null }))
vi.mock('../../../hooks/useMediaSession', () => ({ useMediaSession: useMediaSessionMock }))
vi.mock('../../../hooks/usePageVisibility', () => ({ usePageVisibility: () => true }))
vi.mock('../../../hooks/usePlayerController', () => ({
  usePlayerController: () => ({
    prevSmart: prevSmartSpy,
    nextSmart: nextSmartSpy,
  }),
}))
vi.mock('../../../hooks/useSession', () => ({
  useSession: () => ({ restoreProgress: vi.fn() }),
}))
vi.mock('../../../hooks/useTabSync', () => ({ useTabSync: vi.fn() }))
vi.mock('../../../lib/toast', () => ({ toast: { infoKey: vi.fn(), errorKey: vi.fn() } }))

// VERY IMPORTANT: Mock HTMLMediaElement.prototype.play/pause BEFORE use
if (typeof HTMLMediaElement !== 'undefined') {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
}

describe('GlobalAudioController', () => {
  beforeEach(() => {
    act(() => {
      usePlayerStore.getState().reset()
    })
    vi.clearAllMocks()
  })

  it('updates player progress on audio timeupdate', async () => {
    // Render first with no track
    const { container, rerender } = render(<GlobalAudioController />)

    // Then load a track
    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
    })

    // Rerender to reflect store change
    rerender(<GlobalAudioController />)

    const audio = container.querySelector('audio') as HTMLAudioElement
    expect(audio).toBeTruthy()

    // Mock currentTime property
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => 15.5,
    })

    // Trigger event
    await act(async () => {
      fireEvent.timeUpdate(audio)
    })

    expect(usePlayerStore.getState().progress).toBe(15.5)
  })

  it('recovers loading status to playing on timeupdate when audio is progressing', async () => {
    const { container, rerender } = render(<GlobalAudioController />)

    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
    })

    rerender(<GlobalAudioController />)

    const audio = container.querySelector('audio') as HTMLAudioElement
    expect(audio).toBeTruthy()

    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => 5,
    })
    Object.defineProperty(audio, 'paused', {
      configurable: true,
      get: () => false,
    })
    Object.defineProperty(audio, 'ended', {
      configurable: true,
      get: () => false,
    })

    await act(async () => {
      fireEvent.timeUpdate(audio)
    })

    expect(usePlayerStore.getState().status).toBe('playing')
  })

  it('syncs isPlaying state from store to audio element', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    const { rerender } = render(<GlobalAudioController />)

    // Load track and set playing
    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
    })

    rerender(<GlobalAudioController />)
    expect(playSpy).toHaveBeenCalled()

    // Pause
    await act(async () => {
      usePlayerStore.getState().pause()
    })

    rerender(<GlobalAudioController />)
    expect(pauseSpy).toHaveBeenCalled()

    playSpy.mockRestore()
    pauseSpy.mockRestore()
  })

  it('updates duration in store when audio metadata loads', async () => {
    const { container, rerender } = render(<GlobalAudioController />)

    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
    })

    rerender(<GlobalAudioController />)
    const audio = container.querySelector('audio') as HTMLAudioElement

    Object.defineProperty(audio, 'duration', {
      configurable: true,
      get: () => 120,
    })

    await act(async () => {
      fireEvent.durationChange(audio)
    })

    expect(usePlayerStore.getState().duration).toBe(120)
  })

  it('syncs playbackRate from store to audio element', async () => {
    const { container, rerender } = render(<GlobalAudioController />)

    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
      usePlayerStore.getState().setPlaybackRate(1.5)
    })

    rerender(<GlobalAudioController />)

    const audio = container.querySelector('audio') as HTMLAudioElement
    expect(audio).toBeTruthy()
    expect(audio.playbackRate).toBe(1.5)
  })

  it('handles blocked autoplay by reverting store state to paused', async () => {
    // Mock play to reject with NotAllowedError (standard browser block)
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue({
      name: 'NotAllowedError',
      message: 'Autoplay blocked',
    })

    const { rerender } = render(<GlobalAudioController />)

    // Trigger play via store
    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
      usePlayerStore.getState().play()
    })

    // Rerender to trigger useEffect that calls audio.play()
    rerender(<GlobalAudioController />)

    // Wait for microtasks (promise rejection handler)
    await act(async () => {
      await Promise.resolve()
    })

    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(usePlayerStore.getState().status).toBe('paused')

    playSpy.mockRestore()
  })

  it('resets sleep timer on onEnded if isEndOfEpisode is true', async () => {
    const { useSleepTimerStore } = await import('../../../store/sleepTimerStore')
    act(() => {
      useSleepTimerStore.getState().startEndOfEpisode()
    })

    const { container, rerender } = render(<GlobalAudioController />)
    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
    })
    rerender(<GlobalAudioController />)

    const audio = container.querySelector('audio') as HTMLAudioElement

    await act(async () => {
      fireEvent.ended(audio)
    })

    expect(useSleepTimerStore.getState().isEndOfEpisode).toBe(false)
  })

  it('wires media session prev/next to shared smart navigation behavior', async () => {
    await act(async () => {
      usePlayerStore.setState({ audioUrl: 'https://example.com/audio.mp3', audioLoaded: true })
    })

    render(<GlobalAudioController />)
    const actions = useMediaSessionMock.mock.calls[
      useMediaSessionMock.mock.calls.length - 1
    ]?.[1] as {
      prev: () => void
      next: () => void
    }

    act(() => {
      actions.prev()
    })
    expect(prevSmartSpy).toHaveBeenCalledTimes(1)

    act(() => {
      actions.next()
    })
    expect(nextSmartSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps media session playback status wiring parity', async () => {
    const { rerender } = render(<GlobalAudioController />)
    let playbackStatus = useMediaSessionMock.mock.calls[
      useMediaSessionMock.mock.calls.length - 1
    ]?.[2] as 'none' | 'playing' | 'paused'
    expect(playbackStatus).toBe('none')

    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
      usePlayerStore.getState().play()
    })
    rerender(<GlobalAudioController />)
    playbackStatus = useMediaSessionMock.mock.calls[
      useMediaSessionMock.mock.calls.length - 1
    ]?.[2] as 'none' | 'playing' | 'paused'
    expect(playbackStatus).toBe('playing')

    await act(async () => {
      usePlayerStore.getState().pause()
    })
    rerender(<GlobalAudioController />)
    playbackStatus = useMediaSessionMock.mock.calls[
      useMediaSessionMock.mock.calls.length - 1
    ]?.[2] as 'none' | 'playing' | 'paused'
    expect(playbackStatus).toBe('paused')
  })
})
