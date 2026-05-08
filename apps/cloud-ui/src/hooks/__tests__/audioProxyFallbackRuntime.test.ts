import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginAudioProxyRecovery,
  clearAudioProxyRecoveryState,
  finalizeAudioProxyRecovery,
  getAudioProxyFailoverLogMessage,
  resolveAudioProxyFailoverPlan,
} from '../audioProxyFallbackRuntime'

describe('audioProxyFallbackRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves same-origin proxy plans and rejects invalid owners', () => {
    expect(
      resolveAudioProxyFailoverPlan({
        audioUrl: 'https://cdn.example.com/audio.mp3',
        playbackSourceUrl: 'https://cdn.example.com/audio.mp3',
        attemptedAudioUrl: null,
        proxyBase: '/api/proxy',
        buildProxyUrl: (proxyBase, audioUrl) => `${proxyBase}?url=${encodeURIComponent(audioUrl)}`,
      })
    ).toEqual({
      ok: true,
      proxiedUrl: '/api/proxy?url=https%3A%2F%2Fcdn.example.com%2Faudio.mp3',
    })

    expect(
      resolveAudioProxyFailoverPlan({
        audioUrl: 'https://cdn.example.com/audio.mp3',
        playbackSourceUrl: 'https://proxy.example.com?url=1',
        attemptedAudioUrl: null,
        proxyBase: '/api/proxy',
        buildProxyUrl: vi.fn(),
      })
    ).toEqual({
      ok: false,
      reason: 'already_recovering',
    })

    expect(
      resolveAudioProxyFailoverPlan({
        audioUrl: 'https://cdn.example.com/audio.mp3',
        playbackSourceUrl: 'https://cdn.example.com/audio.mp3',
        attemptedAudioUrl: null,
        proxyBase: 'https://proxy.example.com',
        buildProxyUrl: vi.fn(),
      })
    ).toEqual({
      ok: false,
      reason: 'cross_origin_proxy',
    })
  })

  it('captures and clears proxy recovery state consistently', () => {
    const audio = {
      currentTime: 37,
      src: '',
      load: vi.fn(),
      play: vi.fn(),
    } as unknown as HTMLAudioElement
    const refs = {
      attemptedAudioUrlRef: { current: null as string | null },
      pendingResumeTimeRef: { current: null as number | null },
      pendingResumePlaybackRef: { current: false },
      recoveryRef: { current: { isRecovering: false } },
    }

    beginAudioProxyRecovery({
      audio,
      audioUrl: 'https://cdn.example.com/audio.mp3',
      proxiedUrl: '/api/proxy?url=1',
      refs,
      clearDirectWatchdog: vi.fn(),
      beginProxyAudioRecovery: () => true,
    })

    expect(refs.recoveryRef.current.isRecovering).toBe(true)
    expect(refs.attemptedAudioUrlRef.current).toBe('https://cdn.example.com/audio.mp3')
    expect(refs.pendingResumeTimeRef.current).toBe(37)
    expect(refs.pendingResumePlaybackRef.current).toBe(true)
    expect(audio.src).toBe('/api/proxy?url=1')

    clearAudioProxyRecoveryState(refs)

    expect(refs.recoveryRef.current.isRecovering).toBe(false)
    expect(refs.attemptedAudioUrlRef.current).toBeNull()
    expect(refs.pendingResumeTimeRef.current).toBeNull()
    expect(refs.pendingResumePlaybackRef.current).toBe(false)
  })

  it('restores playback position and optionally resumes playback after recovery', async () => {
    const play = vi.fn().mockResolvedValue(undefined)
    const audio = {
      currentTime: 0,
      play,
    } as unknown as HTMLAudioElement
    const refs = {
      attemptedAudioUrlRef: { current: 'https://cdn.example.com/audio.mp3' as string | null },
      pendingResumeTimeRef: { current: 42 as number | null },
      pendingResumePlaybackRef: { current: true },
      recoveryRef: { current: { isRecovering: true } },
    }

    finalizeAudioProxyRecovery({
      audio,
      refs,
      clearDirectWatchdog: vi.fn(),
      shouldResumeAfterProxyAudioRecovery: () => true,
    })

    expect(audio.currentTime).toBe(42)
    expect(play).toHaveBeenCalledTimes(1)
    expect(refs.recoveryRef.current.isRecovering).toBe(false)
    expect(refs.attemptedAudioUrlRef.current).toBe('https://cdn.example.com/audio.mp3')
    expect(refs.pendingResumeTimeRef.current).toBeNull()
    expect(refs.pendingResumePlaybackRef.current).toBe(false)
  })

  it('returns explicit log messages for error vs timeout failover', () => {
    expect(getAudioProxyFailoverLogMessage('error')).toContain('failed')
    expect(getAudioProxyFailoverLogMessage('timeout')).toContain('timed out')
  })
})
