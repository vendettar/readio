import type { PlaybackSession } from '../../dexieDb'

export type RestoreAppliedEntry = {
  targetTime: number
  appliedAt: number
}

const DUPLICATE_RESTORE_TOLERANCE_SECONDS = 0.2
const DUPLICATE_RESTORE_WINDOW_MS = 750
const RESTORE_APPLIED_MAX_ENTRIES = 64
const RESTORE_APPLIED_MAX_AGE_MS = 5 * 60 * 1000

export async function applyPlaybackSessionRestore(input: {
  audioElement: HTMLAudioElement
  session: PlaybackSession
  sessionId: string
  now: number
  completedRestoreThresholdSeconds: number
  restoreKey: string
  restoreApplied: Map<string, RestoreAppliedEntry>
  isRestoreTargetCurrent: () => boolean
  setProgress: (time: number) => void
  resetCompletedProgress: () => Promise<void>
  log: (message: string, ...args: unknown[]) => void
}): Promise<void> {
  if (input.session.progress < 0) {
    return
  }

  const duration = input.session.durationSeconds
  const isSessionComplete =
    duration > 0 &&
    input.session.progress >= Math.max(0, duration - input.completedRestoreThresholdSeconds)

  const targetTime = isSessionComplete ? 0 : input.session.progress
  const clampedProgress = duration > 0 ? Math.min(targetTime, duration) : targetTime
  const lastApplied = input.restoreApplied.get(input.restoreKey)

  if (
    lastApplied &&
    Math.abs(lastApplied.targetTime - clampedProgress) < DUPLICATE_RESTORE_TOLERANCE_SECONDS &&
    input.now - lastApplied.appliedAt < DUPLICATE_RESTORE_WINDOW_MS
  ) {
    return
  }

  input.audioElement.currentTime = clampedProgress
  input.setProgress(clampedProgress)
  input.restoreApplied.set(input.restoreKey, {
    targetTime: clampedProgress,
    appliedAt: input.now,
  })

  if (isSessionComplete) {
    if (!input.isRestoreTargetCurrent()) return
    await input.resetCompletedProgress()
  }

  input.log('[Session] Restored playback physical position:', clampedProgress, {
    sessionId: input.sessionId,
    isComplete: isSessionComplete,
  })

  if (input.restoreApplied.size <= RESTORE_APPLIED_MAX_ENTRIES) {
    return
  }

  const cutoff = input.now - RESTORE_APPLIED_MAX_AGE_MS
  for (const [key, value] of input.restoreApplied.entries()) {
    if (value.appliedAt < cutoff) {
      input.restoreApplied.delete(key)
    }
  }
}
