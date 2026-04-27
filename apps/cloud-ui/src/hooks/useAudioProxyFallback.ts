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
  recoveryRef: React.MutableRefObject<AudioFallbackRecoveryState>
}

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
  recoveryRef,
}: UseAudioProxyFallbackParams): void {
  const attemptedAudioUrlRef = useRef<string | null>(null)
  const pendingResumeTimeRef = useRef<number | null>(null)
  const pendingResumePlaybackRef = useRef(false)

  useEffect(() => {
    const nextAudioUrl = audioUrl
    if (nextAudioUrl === attemptedAudioUrlRef.current) return

    attemptedAudioUrlRef.current = null
    pendingResumeTimeRef.current = null
    pendingResumePlaybackRef.current = false
    clearRecoveryState(recoveryRef)
  }, [audioUrl, recoveryRef])

  const handleError = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    const { proxyUrl: proxyBase } = getNetworkProxyConfig()
    if (!proxyBase) return
    if (!isSameOriginProxyUrl(proxyBase)) {
      clearRecoveryState(recoveryRef)
      warn(
        '[AudioProxyFallback] Skipping proxy retry because audio fallback only supports same-origin proxy URLs.',
        { proxyUrl: proxyBase }
      )
      return
    }

    if (attemptedAudioUrlRef.current === audioUrl) {
      clearRecoveryState(recoveryRef)
      warn('[AudioProxyFallback] Proxy also failed, giving up.', { audioUrl })
      return
    }

    try {
      const proxiedUrl = buildProxyUrl(proxyBase, audioUrl)
      warn('[AudioProxyFallback] Direct access failed, retrying via proxy...', {
        original: audioUrl,
        proxied: proxiedUrl,
      })

      recoveryRef.current.isRecovering = true
      attemptedAudioUrlRef.current = audioUrl
      pendingResumeTimeRef.current = Number.isFinite(audio.currentTime) ? audio.currentTime : null
      pendingResumePlaybackRef.current = usePlayerStore.getState().isPlaying

      // Keep the player surface in loading until the fallback chain reaches a final outcome.
      usePlayerStore.getState().setStatus('loading')

      audio.src = proxiedUrl
      audio.load()
    } catch (err) {
      clearRecoveryState(recoveryRef)
      pendingResumeTimeRef.current = null
      pendingResumePlaybackRef.current = false
      warn('[AudioProxyFallback] Failed to build proxy URL:', err)
    }
  }, [audioRef, audioUrl, recoveryRef])

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

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
  }, [audioRef, recoveryRef])

  useEventListener('error', handleError, audioRef)
  useEventListener('loadedmetadata', handleLoadedMetadata, audioRef)
}
