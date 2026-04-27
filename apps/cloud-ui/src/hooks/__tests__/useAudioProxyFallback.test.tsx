import { fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioProxyFallback } from '../useAudioProxyFallback'

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
}

function Harness({ audioUrl }: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  useAudioProxyFallback({ audioRef, audioUrl })

  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="audio-proxy-fallback-target" />
}

describe('useAudioProxyFallback', () => {
  beforeEach(() => {
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
    vi.restoreAllMocks()
  })

  it('switches to proxied audio once and restores playback position on loadedmetadata', async () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    const { getByTestId } = render(<Harness audioUrl="https://cdn.example.com/audio.mp3" />)
    const audio = getByTestId('audio-proxy-fallback-target') as HTMLAudioElement

    Object.defineProperty(audio, 'currentTime', { value: 37, writable: true, configurable: true })
    Object.defineProperty(audio, 'paused', { value: false, configurable: true })

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
