import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { warn } from '../lib/logger'
import { buildProxyUrl, getNetworkProxyConfig } from '../lib/networking/proxyUrl'
import {
  beginProxyAudioRecovery,
  shouldResumeAfterProxyAudioRecovery,
} from '../lib/player/playerRuntimeActions'
import type { AudioFallbackRecoveryState } from './audioFallbackRecovery'
import {
  AUDIO_DIRECT_FAILOVER_TIMEOUT_MS,
  beginAudioProxyRecovery,
  clearAudioProxyRecoveryState,
  finalizeAudioProxyRecovery,
  getAudioProxyFailoverLogMessage,
  resolveAudioProxyFailoverPlan,
} from './audioProxyFallbackRuntime'
import { useEventListener } from './useEventListener'

export { AUDIO_DIRECT_FAILOVER_TIMEOUT_MS } from './audioProxyFallbackRuntime'

interface UseAudioProxyFallbackParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  playbackSourceUrl: string | null
  recoveryRef: React.MutableRefObject<AudioFallbackRecoveryState>
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
      const plan = resolveAudioProxyFailoverPlan({
        audioUrl,
        playbackSourceUrl,
        attemptedAudioUrl: attemptedAudioUrlRef.current,
        proxyBase,
        buildProxyUrl,
      })

      if (!plan.ok) {
        if (plan.reason === 'cross_origin_proxy') {
          clearAudioProxyRecoveryState({
            attemptedAudioUrlRef,
            pendingResumeTimeRef,
            pendingResumePlaybackRef,
            recoveryRef,
          })
          warn(
            '[AudioProxyFallback] Skipping proxy retry because audio fallback only supports same-origin proxy URLs.',
            { proxyUrl: proxyBase }
          )
        } else if (plan.reason === 'already_recovering') {
          clearAudioProxyRecoveryState(
            {
              attemptedAudioUrlRef,
              pendingResumeTimeRef,
              pendingResumePlaybackRef,
              recoveryRef,
            },
            { clearAttemptedAudioUrl: false }
          )
        }
        return false
      }

      try {
        warn(
          getAudioProxyFailoverLogMessage(reason),
          {
            original: audioUrl,
            proxied: plan.proxiedUrl,
          }
        )

        beginAudioProxyRecovery({
          audio,
          audioUrl,
          proxiedUrl: plan.proxiedUrl,
          refs: {
            attemptedAudioUrlRef,
            pendingResumeTimeRef,
            pendingResumePlaybackRef,
            recoveryRef,
          },
          clearDirectWatchdog,
          beginProxyAudioRecovery,
        })
        return true
      } catch (err) {
        clearAudioProxyRecoveryState({
          attemptedAudioUrlRef,
          pendingResumeTimeRef,
          pendingResumePlaybackRef,
          recoveryRef,
        })
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
    clearAudioProxyRecoveryState({
      attemptedAudioUrlRef,
      pendingResumeTimeRef,
      pendingResumePlaybackRef,
      recoveryRef,
    })
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

    finalizeAudioProxyRecovery({
      audio,
      refs: {
        attemptedAudioUrlRef,
        pendingResumeTimeRef,
        pendingResumePlaybackRef,
        recoveryRef,
      },
      clearDirectWatchdog,
      shouldResumeAfterProxyAudioRecovery,
    })
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
