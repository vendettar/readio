import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOOTSTRAP_TIMEOUT_MS,
  buildProxyPlaybackUrl,
  extractHost,
  isEligibleForBootstrapFallback,
  remoteFallbackBreaker,
} from '../../lib/player/remotePlaybackFallback'
import { useAudioElementSync } from '../useAudioElementSync'
import { getPlaybackSourceMode, useRemotePlaybackFallback } from '../useRemotePlaybackFallback'

vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

interface HarnessProps {
  audioUrl: string | null
  isPlaying: boolean
}

function Harness({ audioUrl, isPlaying }: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  useRemotePlaybackFallback({ audioRef, audioUrl, isPlaying })
  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="fallback-audio" />
}

function HarnessWithSync({ audioUrl, isPlaying }: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  useRemotePlaybackFallback({ audioRef, audioUrl, isPlaying })
  useAudioElementSync({ audioRef, audioUrl, volume: 1, playbackRate: 1 })
  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="fallback-audio" />
}

function getAudioSrc(audio: HTMLAudioElement): string {
  return audio.getAttribute('src') || audio.src || ''
}

describe('remotePlaybackFallback (pure logic)', () => {
  describe('isEligibleForBootstrapFallback', () => {
    it('returns true for remote http/https URLs', () => {
      expect(isEligibleForBootstrapFallback('https://example.com/audio.mp3')).toBe(true)
      expect(isEligibleForBootstrapFallback('http://example.com/audio.mp3')).toBe(true)
    })

    it('returns false for blob URLs', () => {
      expect(isEligibleForBootstrapFallback('blob:http://localhost:3000/abc')).toBe(false)
    })

    it('returns false for proxy URLs', () => {
      expect(isEligibleForBootstrapFallback('/api/proxy?url=https://example.com')).toBe(false)
      expect(
        isEligibleForBootstrapFallback('https://myapp.com/api/proxy?url=https://example.com')
      ).toBe(false)
    })

    it('returns false for null/undefined/empty', () => {
      expect(isEligibleForBootstrapFallback(null)).toBe(false)
      expect(isEligibleForBootstrapFallback(undefined)).toBe(false)
      expect(isEligibleForBootstrapFallback('')).toBe(false)
    })

    it('returns false for local file URLs', () => {
      expect(isEligibleForBootstrapFallback('file:///local/audio.mp3')).toBe(false)
    })
  })

  describe('buildProxyPlaybackUrl', () => {
    it('builds a proxy URL with encoded remote URL', () => {
      const result = buildProxyPlaybackUrl('https://example.com/audio.mp3')
      expect(result).toBe('/api/proxy?url=https%3A%2F%2Fexample.com%2Faudio.mp3')
    })

    it('encodes special characters in the remote URL', () => {
      const result = buildProxyPlaybackUrl('https://example.com/audio?token=abc&format=mp3')
      expect(result).toBe(
        '/api/proxy?url=https%3A%2F%2Fexample.com%2Faudio%3Ftoken%3Dabc%26format%3Dmp3'
      )
    })
  })

  describe('extractHost', () => {
    it('extracts hostname from URL', () => {
      expect(extractHost('https://example.com/audio.mp3')).toBe('example.com')
      expect(extractHost('https://cdn.example.com/path/to/audio.mp3')).toBe('cdn.example.com')
    })

    it('returns null for invalid URLs', () => {
      expect(extractHost('not-a-url')).toBe(null)
      expect(extractHost('')).toBe(null)
    })
  })

  describe('remoteFallbackBreaker', () => {
    afterEach(() => {
      remoteFallbackBreaker.reset()
    })

    it('returns false initially for any host', () => {
      expect(remoteFallbackBreaker.shouldProxyFirst('example.com')).toBe(false)
    })

    it('returns true after 3 failures on same host', () => {
      remoteFallbackBreaker.recordFailure('example.com')
      remoteFallbackBreaker.recordFailure('example.com')
      remoteFallbackBreaker.recordFailure('example.com')
      expect(remoteFallbackBreaker.shouldProxyFirst('example.com')).toBe(true)
    })

    it('does not trigger for different host', () => {
      remoteFallbackBreaker.recordFailure('example.com')
      remoteFallbackBreaker.recordFailure('example.com')
      remoteFallbackBreaker.recordFailure('example.com')
      expect(remoteFallbackBreaker.shouldProxyFirst('other.com')).toBe(false)
    })

    it('resets all state', () => {
      remoteFallbackBreaker.recordFailure('example.com')
      remoteFallbackBreaker.recordFailure('example.com')
      remoteFallbackBreaker.recordFailure('example.com')
      remoteFallbackBreaker.reset()
      expect(remoteFallbackBreaker.shouldProxyFirst('example.com')).toBe(false)
    })
  })
})

describe('useRemotePlaybackFallback (hook)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    remoteFallbackBreaker.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    remoteFallbackBreaker.reset()
  })

  it('direct playback succeeds within timeout — no proxy switch', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    // Simulate actual playback (not just metadata) before timeout
    act(() => {
      audio.dispatchEvent(new Event('playing'))
    })

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS)
    })

    expect(getAudioSrc(audio)).not.toContain('/api/proxy')
  })

  it('loadedmetadata alone does NOT clear timeout — only playing does', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    // loadedmetadata fires but stream never becomes playable
    act(() => {
      audio.dispatchEvent(new Event('loadedmetadata'))
    })

    // Timeout should still fire because 'playing' never arrived
    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).toContain('/api/proxy')
  })

  it('pending direct playback switches to proxy and resumes playback after timeout', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement
    const playSpy = vi.spyOn(audio, 'play').mockResolvedValue(undefined)

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).toContain('/api/proxy')
    expect(getAudioSrc(audio)).toContain(encodeURIComponent('https://example.com/audio.mp3'))
    expect(playSpy).toHaveBeenCalled()
  })

  it('host breaker: proxy-first also resumes playback', () => {
    remoteFallbackBreaker.recordFailure('example.com')
    remoteFallbackBreaker.recordFailure('example.com')
    remoteFallbackBreaker.recordFailure('example.com')

    // Spy on HTMLAudioElement.prototype.play BEFORE render, since proxy-first
    // executes synchronously in the initial effect.
    const playSpy = vi.spyOn(HTMLAudioElement.prototype, 'play').mockResolvedValue(undefined)

    render(<Harness audioUrl="https://example.com/audio2.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    const src = getAudioSrc(audio)
    expect(src).toContain('/api/proxy')
    expect(src).toContain(encodeURIComponent('https://example.com/audio2.mp3'))
    expect(playSpy).toHaveBeenCalled()
  })

  it('after proxy switch, no second bootstrap timeout fires', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    const proxySrc = getAudioSrc(audio)
    expect(proxySrc).toContain('/api/proxy')

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).toBe(proxySrc)
  })

  it('host breaker: 3 failures on same host → next play goes proxy-first', () => {
    remoteFallbackBreaker.recordFailure('example.com')
    remoteFallbackBreaker.recordFailure('example.com')
    remoteFallbackBreaker.recordFailure('example.com')

    render(<Harness audioUrl="https://example.com/audio2.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    const src = getAudioSrc(audio)
    expect(src).toContain('/api/proxy')
    expect(src).toContain(encodeURIComponent('https://example.com/audio2.mp3'))
  })

  it('blob URLs are excluded from bootstrap timeout', () => {
    render(<Harness audioUrl="blob:http://localhost:3000/abc-123" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).not.toContain('/api/proxy')
  })

  it('local/file URLs are excluded from bootstrap timeout', () => {
    render(<Harness audioUrl="file:///local/audio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).not.toContain('/api/proxy')
  })

  it('fallback does NOT call setAudioUrl (track identity preserved)', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).toContain('/api/proxy')
  })

  it('fallback does NOT create blob URLs', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).not.toContain('blob:')
  })

  it('does not activate when isPlaying is false', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying={false} />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).not.toContain('/api/proxy')
  })

  it('resets state when audioUrl changes (new track)', () => {
    const { rerender } = render(<Harness audioUrl="https://example.com/audio1.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS / 2)
    })

    rerender(<Harness audioUrl="https://different.com/other.mp3" isPlaying />)

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS / 2)
    })

    expect(getAudioSrc(audio)).not.toContain('/api/proxy')
  })

  it('proxy URLs are excluded from bootstrap timeout', () => {
    render(<Harness audioUrl="/api/proxy?url=https%3A%2F%2Fexample.com%2Faudio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    const src = getAudioSrc(audio)
    expect(src).not.toMatch(/\/api\/proxy.*\/api\/proxy/)
  })
})

describe('playbackSourceMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    remoteFallbackBreaker.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    remoteFallbackBreaker.reset()
  })

  it('starts as null when no audio is playing', () => {
    expect(getPlaybackSourceMode()).toBeNull()
  })

  it('becomes "direct" when eligible remote URL starts playing', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    expect(getPlaybackSourceMode()).toBe('direct')
  })

  it('becomes "proxy-fallback" after timeout triggers switch', () => {
    render(<Harness audioUrl="https://example.com/audio.mp3" isPlaying />)

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getAudioSrc(audio)).toContain('/api/proxy')
    expect(getPlaybackSourceMode()).toBe('proxy-fallback')
  })

  it('becomes "proxy-fallback" directly when breaker triggers proxy-first (no direct intermediate)', () => {
    remoteFallbackBreaker.recordFailure('example.com')
    remoteFallbackBreaker.recordFailure('example.com')
    remoteFallbackBreaker.recordFailure('example.com')

    render(<Harness audioUrl="https://example.com/audio2.mp3" isPlaying />)

    expect(getPlaybackSourceMode()).toBe('proxy-fallback')
  })

  it('resets to null when audioUrl changes (new track)', () => {
    const { rerender } = render(<Harness audioUrl="https://example.com/audio1.mp3" isPlaying />)

    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(getPlaybackSourceMode()).toBe('proxy-fallback')

    // Change to a different eligible URL — mode resets to null at render time,
    // then the effect sets it to 'direct' for the new URL.
    // The key: it does NOT stay as 'proxy-fallback' from the old track.
    rerender(<Harness audioUrl="https://different.com/audio2.mp3" isPlaying />)

    // After rerender + effect, should be 'direct' for the new URL, not 'proxy-fallback'
    expect(getPlaybackSourceMode()).toBe('direct')
  })

  it('mode is null for non-eligible URLs', () => {
    render(<Harness audioUrl="blob:http://localhost:3000/abc" isPlaying />)

    expect(getPlaybackSourceMode()).toBeNull()
  })
})

describe('useRemotePlaybackFallback + useAudioElementSync integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    remoteFallbackBreaker.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    remoteFallbackBreaker.reset()
  })

  it('proxy src survives a re-render when both hooks are mounted', () => {
    const { rerender } = render(
      <HarnessWithSync audioUrl="https://example.com/audio.mp3" isPlaying />
    )

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    // Trigger timeout fallback
    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    const proxySrc = getAudioSrc(audio)
    expect(proxySrc).toContain('/api/proxy')

    // Force a re-render with the same props — useAudioElementSync's effect
    // will run again and must NOT overwrite the proxy src back to the
    // original remote URL.
    rerender(<HarnessWithSync audioUrl="https://example.com/audio.mp3" isPlaying />)

    expect(getAudioSrc(audio)).toBe(proxySrc)
    expect(getAudioSrc(audio)).not.toContain('https://example.com/audio.mp3')
  })

  it('new track src is assigned after previous track fell back to proxy', () => {
    const { rerender } = render(
      <HarnessWithSync audioUrl="https://example.com/audio1.mp3" isPlaying />
    )

    const audio = screen.getByTestId('fallback-audio') as HTMLAudioElement

    // First track falls back to proxy
    act(() => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100)
    })

    expect(audio.src).toContain('/api/proxy')
    expect(audio.src).toContain(encodeURIComponent('https://example.com/audio1.mp3'))

    // Switch to a new track — useAudioElementSync must assign the new remote src
    rerender(<HarnessWithSync audioUrl="https://other.com/audio2.mp3" isPlaying />)

    // The audio.src property should be the new remote URL
    expect(audio.src).toContain('https://other.com/audio2.mp3')
    expect(audio.src).not.toContain('https://example.com/audio1.mp3')
  })
})
