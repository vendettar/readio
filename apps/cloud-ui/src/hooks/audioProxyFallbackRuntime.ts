import type { MutableRefObject } from 'react'

export const AUDIO_DIRECT_FAILOVER_TIMEOUT_MS = 3000

export interface AudioFallbackRecoveryState {
  isRecovering: boolean
}

type ProxyFailoverReason = 'error' | 'timeout'

export interface AudioProxyFallbackRefs {
  attemptedAudioUrlRef: MutableRefObject<string | null>
  pendingResumeTimeRef: MutableRefObject<number | null>
  pendingResumePlaybackRef: MutableRefObject<boolean>
  recoveryRef: MutableRefObject<AudioFallbackRecoveryState>
}

export interface ResolveAudioProxyFailoverPlanInput {
  audioUrl: string
  playbackSourceUrl: string | null
  attemptedAudioUrl: string | null
  proxyBase: string
  buildProxyUrl: (proxyBase: string, audioUrl: string) => string
}

export type AudioProxyFailoverPlan =
  | { ok: false; reason: 'missing_proxy' | 'cross_origin_proxy' | 'already_recovering' }
  | { ok: true; proxiedUrl: string }

export function isSameOriginProxyUrl(proxyUrl: string): boolean {
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

export function clearAudioProxyRecoveryState(
  refs: AudioProxyFallbackRefs,
  options?: { clearAttemptedAudioUrl?: boolean }
): void {
  refs.recoveryRef.current.isRecovering = false
  refs.pendingResumeTimeRef.current = null
  refs.pendingResumePlaybackRef.current = false
  if (options?.clearAttemptedAudioUrl !== false) {
    refs.attemptedAudioUrlRef.current = null
  }
}

export function resolveAudioProxyFailoverPlan(
  input: ResolveAudioProxyFailoverPlanInput
): AudioProxyFailoverPlan {
  if (!input.proxyBase) {
    return { ok: false, reason: 'missing_proxy' }
  }

  if (!isSameOriginProxyUrl(input.proxyBase)) {
    return { ok: false, reason: 'cross_origin_proxy' }
  }

  const isAlreadyOnProxySource =
    !!input.playbackSourceUrl && input.playbackSourceUrl !== input.audioUrl
  if (input.attemptedAudioUrl === input.audioUrl || isAlreadyOnProxySource) {
    return { ok: false, reason: 'already_recovering' }
  }

  return {
    ok: true,
    proxiedUrl: input.buildProxyUrl(input.proxyBase, input.audioUrl),
  }
}

export function beginAudioProxyRecovery(input: {
  audio: HTMLAudioElement
  audioUrl: string
  proxiedUrl: string
  refs: AudioProxyFallbackRefs
  clearDirectWatchdog: () => void
  beginProxyAudioRecovery: (proxiedUrl: string) => boolean
}): void {
  input.clearDirectWatchdog()
  input.refs.recoveryRef.current.isRecovering = true
  input.refs.attemptedAudioUrlRef.current = input.audioUrl
  input.refs.pendingResumeTimeRef.current = Number.isFinite(input.audio.currentTime)
    ? input.audio.currentTime
    : null
  input.refs.pendingResumePlaybackRef.current = input.beginProxyAudioRecovery(input.proxiedUrl)

  input.audio.src = input.proxiedUrl
  input.audio.load()
}

export function finalizeAudioProxyRecovery(input: {
  audio: HTMLAudioElement
  refs: AudioProxyFallbackRefs
  clearDirectWatchdog: () => void
  shouldResumeAfterProxyAudioRecovery: (pendingResumePlayback: boolean) => boolean
}): void {
  input.clearDirectWatchdog()

  const resumeTime = input.refs.pendingResumeTimeRef.current
  const shouldResumePlayback = input.shouldResumeAfterProxyAudioRecovery(
    input.refs.pendingResumePlaybackRef.current
  )

  clearAudioProxyRecoveryState(input.refs, {
    clearAttemptedAudioUrl: false,
  })

  if (resumeTime !== null) {
    try {
      input.audio.currentTime = resumeTime
    } catch {
      // Ignore seek restore failures and keep playback recovery best-effort.
    }
  }

  if (shouldResumePlayback) {
    void input.audio.play().catch(() => {
      // Autoplay might be blocked after recovery; keep the retry best-effort.
    })
  }
}

export function getAudioProxyFailoverLogMessage(reason: ProxyFailoverReason): string {
  return reason === 'timeout'
    ? '[AudioProxyFallback] Direct access timed out, retrying via proxy...'
    : '[AudioProxyFallback] Direct access failed, retrying via proxy...'
}
