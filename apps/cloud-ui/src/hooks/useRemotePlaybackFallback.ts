import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import {
  BOOTSTRAP_TIMEOUT_MS,
  buildProxyPlaybackUrl,
  extractHost,
  isEligibleForBootstrapFallback,
  remoteFallbackBreaker,
} from '../lib/player/remotePlaybackFallback'

type PlaybackSourceMode = 'direct' | 'proxy-fallback' | null

let playbackSourceMode: PlaybackSourceMode = null

export function getPlaybackSourceMode(): PlaybackSourceMode {
  return playbackSourceMode
}

interface UseRemotePlaybackFallbackParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  isPlaying: boolean
}

export function useRemotePlaybackFallback({
  audioRef,
  audioUrl,
  isPlaying,
}: UseRemotePlaybackFallbackParams): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const proxiedRef = useRef(false)

  const clearBootstrapTimeout = useCallback((): void => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Reset state when audioUrl changes (new track)
  useEffect(() => {
    proxiedRef.current = false
    playbackSourceMode = null
    clearBootstrapTimeout()
  }, [clearBootstrapTimeout])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearBootstrapTimeout()
    }
  }, [clearBootstrapTimeout])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl || !isPlaying) {
      clearBootstrapTimeout()
      return
    }

    // Only activate for eligible remote URLs
    if (!isEligibleForBootstrapFallback(audioUrl)) {
      clearBootstrapTimeout()
      return
    }

    // Don't start a second timeout if already proxied for this URL
    if (proxiedRef.current) return

    // Check host breaker — if threshold met, go proxy-first immediately
    const host = extractHost(audioUrl)
    if (host && remoteFallbackBreaker.shouldProxyFirst(host)) {
      proxiedRef.current = true
      playbackSourceMode = 'proxy-fallback'
      clearBootstrapTimeout()
      const proxyUrl = buildProxyPlaybackUrl(audioUrl)
      // Set both property and attribute so useAudioElementSync won't overwrite
      // it back to the original remote URL on the next render cycle.
      audio.src = proxyUrl
      audio.setAttribute('src', proxyUrl)
      audio.load()
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay may be blocked — let useAutoplayRetry handle it
        })
      }
      return
    }

    // Start bootstrap timeout
    playbackSourceMode = 'direct'
    clearBootstrapTimeout()
    timeoutRef.current = setTimeout(() => {
      if (proxiedRef.current) return

      const h = extractHost(audioUrl)
      if (h) {
        remoteFallbackBreaker.recordFailure(h)
      }

      proxiedRef.current = true
      playbackSourceMode = 'proxy-fallback'
      clearBootstrapTimeout()

      const proxyUrl = buildProxyPlaybackUrl(audioUrl)
      // Set both property and attribute so useAudioElementSync won't overwrite
      // it back to the original remote URL on the next render cycle.
      audio.src = proxyUrl
      audio.setAttribute('src', proxyUrl)
      audio.load()
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay may be blocked — let useAutoplayRetry handle it
        })
      }
    }, BOOTSTRAP_TIMEOUT_MS)

    // Treat canplay as a successful direct bootstrap boundary.
    // loadedmetadata is still too early, but canplay means the browser has
    // decoded enough media to begin playback without forcing proxy fallback.
    const onBootstrapReady = () => {
      // Record success for the host to allow recovery from proxy-locked state
      const h = extractHost(audioUrl)
      if (h) {
        remoteFallbackBreaker.recordSuccess(h)
      }
      clearBootstrapTimeout()
    }

    audio.addEventListener('canplay', onBootstrapReady)
    audio.addEventListener('playing', onBootstrapReady)

    return () => {
      clearBootstrapTimeout()
      audio.removeEventListener('canplay', onBootstrapReady)
      audio.removeEventListener('playing', onBootstrapReady)
    }
  }, [audioRef, audioUrl, isPlaying, clearBootstrapTimeout])
}
