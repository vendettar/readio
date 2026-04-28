import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { warn } from '../lib/logger'
import { buildProxyUrl, getNetworkProxyConfig } from '../lib/networking/proxyUrl'
import { usePlayerStore } from '../store/playerStore'
import type { AudioFallbackRecoveryState } from './audioFallbackRecovery'
import { useEventListener } from './useEventListener'

interface UseAudioProxyFallbackParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  playbackSourceUrl: string | null
  recoveryRef: React.MutableRefObject<AudioFallbackRecoveryState>
}

export const AUDIO_DIRECT_FAILOVER_TIMEOUT_MS = 3000

function isSameOriginProxyUrl(proxyUrl: string): boolean {
  const trimmed = proxyUrl.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/')) return true
  if (typeof window === 'undefined') return false

  try {
    return new URL(trimmed, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

function clearRecoveryState(recoveryRef: React.MutableRefObject<AudioFallbackRecoveryState>): void {
  recoveryRef.current.isRecovering = false
}

export function useAudioProxyFallback({
  audioRef,
  audioUrl,
  playbackSourceUrl,
  recoveryRef,
}: UseAudioProxyFallbackParams): void {
  const attemptedAudioUrlRef = useRef<string | null>(null)
  const pendingResumeTimeRef = useRef<number | null>(null)
  const pendingResumePlaybackRef = useRef(false)
  const directWatchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDirectWatchdog = useCallback(() => {
    if (directWatchdogTimeoutRef.current) {
      clearTimeout(directWatchdogTimeoutRef.current)
      directWatchdogTimeoutRef.current = null
    }
  }, [])

  const failoverToProxy = useCallback(
    (reason: 'error' | 'timeout') => {
      const audio = audioRef.current
      if (!audio || !audioUrl) return false

      const { proxyUrl: proxyBase } = getNetworkProxyConfig()
      if (!proxyBase) return false
      if (!isSameOriginProxyUrl(proxyBase)) {
        clearRecoveryState(recoveryRef)
        warn(
          '[AudioProxyFallback] Skipping proxy retry because audio fallback only supports same-origin proxy URLs.',
          { proxyUrl: proxyBase }
        )
        return false
      }

      const isAlreadyOnProxySource = !!playbackSourceUrl && playbackSourceUrl !== audioUrl
      if (attemptedAudioUrlRef.current === audioUrl || isAlreadyOnProxySource) {
        clearRecoveryState(recoveryRef)
        return false
      }

      try {
        const proxiedUrl = buildProxyUrl(proxyBase, audioUrl)
        warn(
          reason === 'timeout'
            ? '[AudioProxyFallback] Direct access timed out, retrying via proxy...'
            : '[AudioProxyFallback] Direct access failed, retrying via proxy...',
          {
            original: audioUrl,
            proxied: proxiedUrl,
          }
        )

        clearDirectWatchdog()
        recoveryRef.current.isRecovering = true
        attemptedAudioUrlRef.current = audioUrl
        pendingResumeTimeRef.current = Number.isFinite(audio.currentTime) ? audio.currentTime : null
        pendingResumePlaybackRef.current = usePlayerStore.getState().isPlaying

        usePlayerStore.getState().setStatus('loading')
        usePlayerStore.getState().setPlaybackSourceUrl(proxiedUrl)

        // Apply immediately so the media element switches sources in the current task;
        // store state remains the authoritative source for subsequent syncs.
        audio.src = proxiedUrl
        audio.load()
        return true
      } catch (err) {
        clearRecoveryState(recoveryRef)
        pendingResumeTimeRef.current = null
        pendingResumePlaybackRef.current = false
        warn('[AudioProxyFallback] Failed to build proxy URL:', err)
        return false
      }
    },
    [audioRef, audioUrl, clearDirectWatchdog, playbackSourceUrl, recoveryRef]
  )

  useEffect(() => {
    const nextAudioUrl = audioUrl
    if (nextAudioUrl === attemptedAudioUrlRef.current) return

    clearDirectWatchdog()
    attemptedAudioUrlRef.current = null
    pendingResumeTimeRef.current = null
    pendingResumePlaybackRef.current = false
    clearRecoveryState(recoveryRef)
  }, [audioUrl, clearDirectWatchdog, recoveryRef])

  const handleError = useCallback(() => {
    if (!failoverToProxy('error') && attemptedAudioUrlRef.current === audioUrl) {
      warn('[AudioProxyFallback] Proxy also failed, giving up.', { audioUrl })
    }
  }, [audioUrl, failoverToProxy])

  const clearRecoveryWatchdogOnReady = useCallback(() => {
    clearDirectWatchdog()
  }, [clearDirectWatchdog])

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    clearDirectWatchdog()
    const resumeTime = pendingResumeTimeRef.current
    const shouldResumePlayback =
      pendingResumePlaybackRef.current && usePlayerStore.getState().isPlaying

    pendingResumeTimeRef.current = null
    pendingResumePlaybackRef.current = false
    clearRecoveryState(recoveryRef)

    if (resumeTime !== null) {
      try {
        audio.currentTime = resumeTime
      } catch {
        // Ignore seek restore failures and keep playback recovery best-effort.
      }
    }

    if (shouldResumePlayback) {
      void audio.play().catch(() => {
        // Autoplay might be blocked after recovery; keep the retry best-effort.
      })
    }
  }, [audioRef, clearDirectWatchdog, recoveryRef])

  const handleLoadStart = useCallback(() => {
    clearDirectWatchdog()

    if (!audioUrl || !playbackSourceUrl || playbackSourceUrl !== audioUrl) {
      return
    }

    directWatchdogTimeoutRef.current = setTimeout(() => {
      void failoverToProxy('timeout')
    }, AUDIO_DIRECT_FAILOVER_TIMEOUT_MS)
  }, [audioUrl, clearDirectWatchdog, failoverToProxy, playbackSourceUrl])

  useEventListener('error', handleError, audioRef)
  useEventListener('loadstart', handleLoadStart, audioRef)
  useEventListener('canplay', clearRecoveryWatchdogOnReady, audioRef)
  useEventListener('playing', clearRecoveryWatchdogOnReady, audioRef)
  useEventListener('loadedmetadata', handleLoadedMetadata, audioRef)

  useEffect(() => {
    return () => {
      clearDirectWatchdog()
    }
  }, [clearDirectWatchdog])
}
