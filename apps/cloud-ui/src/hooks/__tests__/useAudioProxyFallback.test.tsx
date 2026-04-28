import { act, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import type { AudioFallbackRecoveryState } from '../audioFallbackRecovery'
import { AUDIO_DIRECT_FAILOVER_TIMEOUT_MS, useAudioProxyFallback } from '../useAudioProxyFallback'

const { buildProxyUrlMock, getNetworkProxyConfigMock, warnMock } = vi.hoisted(() => ({
  buildProxyUrlMock: vi.fn(),
  getNetworkProxyConfigMock: vi.fn(),
  warnMock: vi.fn(),
}))

vi.mock('../../lib/networking/proxyUrl', () => ({
  buildProxyUrl: (...args: unknown[]) => buildProxyUrlMock(...args),
  getNetworkProxyConfig: () => getNetworkProxyConfigMock(),
}))

vi.mock('../../lib/logger', () => ({
  warn: (...args: unknown[]) => warnMock(...args),
  log: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

interface HarnessProps {
  audioUrl: string | null
  playbackSourceUrl?: string | null
}

function Harness({ audioUrl, playbackSourceUrl }: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const recoveryRef = useRef<AudioFallbackRecoveryState>({ isRecovering: false })
  useAudioProxyFallback({
    audioRef,
    audioUrl,
    playbackSourceUrl: playbackSourceUrl ?? audioUrl,
    recoveryRef,
  })

  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="audio-proxy-fallback-target" />
}

describe('useAudioProxyFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePlayerStore.getState().reset()
    vi.clearAllMocks()
    getNetworkProxyConfigMock.mockReturnValue({
      proxyUrl: '/api/proxy',
      authHeader: '',
      authValue: '',
    })
    buildProxyUrlMock.mockImplementation((proxyBase: string, audioUrl: string) => {
      return `${proxyBase}?url=${encodeURIComponent(audioUrl)}`
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('switches to proxied audio once and restores playback position on loadedmetadata', async () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    usePlayerStore.setState({
      isPlaying: true,
      status: 'loading',
      playbackSourceUrl: 'https://cdn.example.com/audio.mp3',
    })

    const { getByTestId } = render(<Harness audioUrl="https://cdn.example.com/audio.mp3" />)
    const audio = getByTestId('audio-proxy-fallback-target') as HTMLAudioElement

    Object.defineProperty(audio, 'currentTime', { value: 37, writable: true, configurable: true })
    Object.defineProperty(audio, 'paused', { value: true, configurable: true })

    fireEvent.error(audio)

    expect(buildProxyUrlMock).toHaveBeenCalledWith(
      '/api/proxy',
      'https://cdn.example.com/audio.mp3'
    )
    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(audio.src).toContain('/api/proxy?url=')

    fireEvent(audio, new Event('loadedmetadata'))

    expect(audio.currentTime).toBe(37)
    expect(playSpy).toHaveBeenCalledTimes(1)
    expect(usePlayerStore.getState().status).toBe('loading')
    expect(usePlayerStore.getState().playbackSourceUrl).toContain('/api/proxy?url=')
  })

  it('does not retry indefinitely when proxied playback also errors', () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})

    const { getByTestId } = render(<Harness audioUrl="https://cdn.example.com/audio.mp3" />)
    const audio = getByTestId('audio-proxy-fallback-target') as HTMLAudioElement

    Object.defineProperty(audio, 'currentTime', { value: 0, writable: true, configurable: true })
    Object.defineProperty(audio, 'paused', { value: false, configurable: true })

    fireEvent.error(audio)
    fireEvent.error(audio)

    expect(buildProxyUrlMock).toHaveBeenCalledTimes(1)
    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledWith('[AudioProxyFallback] Proxy also failed, giving up.', {
      audioUrl: 'https://cdn.example.com/audio.mp3',
    })
  })

  it('fails over to proxy after 3 seconds without ready progress on direct source', async () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    usePlayerStore.setState({
      playbackSourceUrl: 'https://cdn.example.com/audio.mp3',
    })

    const { getByTestId } = render(<Harness audioUrl="https://cdn.example.com/audio.mp3" />)
    const audio = getByTestId('audio-proxy-fallback-target') as HTMLAudioElement

    Object.defineProperty(audio, 'currentTime', { value: 0, writable: true, configurable: true })

    await act(async () => {
      fireEvent.loadStart(audio)
      vi.advanceTimersByTime(AUDIO_DIRECT_FAILOVER_TIMEOUT_MS)
    })

    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(usePlayerStore.getState().playbackSourceUrl).toContain('/api/proxy?url=')
  })

  it('resets retry state when the track changes', () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})

    const { getByTestId, rerender } = render(<Harness audioUrl="https://cdn.example.com/one.mp3" />)
    const audio = getByTestId('audio-proxy-fallback-target') as HTMLAudioElement

    Object.defineProperty(audio, 'currentTime', { value: 5, writable: true, configurable: true })
    Object.defineProperty(audio, 'paused', { value: false, configurable: true })

    fireEvent.error(audio)

    rerender(<Harness audioUrl="https://cdn.example.com/two.mp3" />)
    fireEvent.error(audio)

    expect(buildProxyUrlMock).toHaveBeenNthCalledWith(
      1,
      '/api/proxy',
      'https://cdn.example.com/one.mp3'
    )
    expect(buildProxyUrlMock).toHaveBeenNthCalledWith(
      2,
      '/api/proxy',
      'https://cdn.example.com/two.mp3'
    )
    expect(loadSpy).toHaveBeenCalledTimes(2)
  })

  it('no-ops when no proxy is configured', () => {
    getNetworkProxyConfigMock.mockReturnValue({
      proxyUrl: '',
      authHeader: '',
      authValue: '',
    })
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})

    const { getByTestId } = render(<Harness audioUrl="https://cdn.example.com/audio.mp3" />)
    const audio = getByTestId('audio-proxy-fallback-target') as HTMLAudioElement

    fireEvent.error(audio)

    expect(buildProxyUrlMock).not.toHaveBeenCalled()
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('skips fallback when the proxy URL is cross-origin', () => {
    getNetworkProxyConfigMock.mockReturnValue({
      proxyUrl: 'https://proxy.example.com',
      authHeader: 'x-proxy-token',
      authValue: 'secret',
    })
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})

    const { getByTestId } = render(<Harness audioUrl="https://cdn.example.com/audio.mp3" />)
    const audio = getByTestId('audio-proxy-fallback-target') as HTMLAudioElement

    fireEvent.error(audio)

    expect(buildProxyUrlMock).not.toHaveBeenCalled()
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('does not attempt audio fallback through an external proxy URL', () => {
    getNetworkProxyConfigMock.mockReturnValue({
      proxyUrl: 'https://worker.example/proxy',
      authHeader: 'x-proxy-token',
      authValue: 'secret',
    })
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})

    const { getByTestId } = render(<Harness audioUrl="https://cdn.example.com/audio.mp3" />)
    const audio = getByTestId('audio-proxy-fallback-target') as HTMLAudioElement

    fireEvent.error(audio)

    expect(buildProxyUrlMock).not.toHaveBeenCalled()
    expect(loadSpy).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalledWith(
      '[AudioProxyFallback] Skipping proxy retry because audio fallback only supports same-origin proxy URLs.',
      { proxyUrl: 'https://worker.example/proxy' }
    )
  })
})
