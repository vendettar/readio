import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { warn } from '../lib/logger'
import { buildProxyUrl, getNetworkProxyConfig } from '../lib/networking/proxyUrl'
import { useEventListener } from './useEventListener'

interface UseAudioProxyFallbackParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
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

export function useAudioProxyFallback({ audioRef, audioUrl }: UseAudioProxyFallbackParams): void {
  const attemptedAudioUrlRef = useRef<string | null>(null)
  const pendingResumeTimeRef = useRef<number | null>(null)
  const pendingResumePlaybackRef = useRef(false)

  useEffect(() => {
    if (audioUrl || !audioUrl) {
      attemptedAudioUrlRef.current = null
      pendingResumeTimeRef.current = null
      pendingResumePlaybackRef.current = false
    }
  }, [audioUrl])

  const handleError = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    const { proxyUrl: proxyBase } = getNetworkProxyConfig()
    if (!proxyBase) return
    if (!isSameOriginProxyUrl(proxyBase)) {
      warn(
        '[AudioProxyFallback] Skipping proxy retry because audio fallback only supports same-origin proxy URLs.',
        { proxyUrl: proxyBase }
      )
      return
    }

    if (attemptedAudioUrlRef.current === audioUrl) {
      warn('[AudioProxyFallback] Proxy also failed, giving up.', { audioUrl })
      return
    }

    try {
      const proxiedUrl = buildProxyUrl(proxyBase, audioUrl)
      warn('[AudioProxyFallback] Direct access failed, retrying via proxy...', {
        original: audioUrl,
        proxied: proxiedUrl,
      })

      attemptedAudioUrlRef.current = audioUrl
      pendingResumeTimeRef.current = Number.isFinite(audio.currentTime) ? audio.currentTime : null
      pendingResumePlaybackRef.current = !audio.paused

      audio.src = proxiedUrl
      audio.load()
    } catch (err) {
      pendingResumeTimeRef.current = null
      pendingResumePlaybackRef.current = false
      warn('[AudioProxyFallback] Failed to build proxy URL:', err)
    }
  }, [audioRef, audioUrl])

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    const resumeTime = pendingResumeTimeRef.current
    const shouldResumePlayback = pendingResumePlaybackRef.current

    pendingResumeTimeRef.current = null
    pendingResumePlaybackRef.current = false

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
  }, [audioRef])

  useEventListener('error', handleError, audioRef)
  useEventListener('loadedmetadata', handleLoadedMetadata, audioRef)
}
