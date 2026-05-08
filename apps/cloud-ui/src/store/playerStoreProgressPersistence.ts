import { isAbortLikeError } from '../lib/fetchUtils'
import { log, warn } from '../lib/logger'
import {
  PERSIST_PLAYBACK_PROGRESS_REASON,
  persistEndedPlaybackProgress,
  persistPlaybackProgressSnapshot,
} from '../lib/player/playerProgressPersistenceService'

let lastProgressSaveTime = 0

function detachMissingSession(
  result: { ok: boolean; reason: string },
  detachSessionPersistence: () => void
): boolean {
  if (!result.ok && result.reason === PERSIST_PLAYBACK_PROGRESS_REASON.SESSION_NOT_FOUND) {
    detachSessionPersistence()
    return true
  }
  return false
}

export function persistPlayerProgressUpdate(input: {
  time: number
  saveIntervalMs: number
  state: {
    sessionId: string | null
    duration: number
    isPlaying: boolean
  }
  detachSessionPersistence: () => void
}): void {
  const now = Date.now()
  if (now - lastProgressSaveTime < input.saveIntervalMs) {
    return
  }
  lastProgressSaveTime = now

  if (!input.state.sessionId || input.time <= 0) return

  void persistPlaybackProgressSnapshot({
    sessionId: input.state.sessionId,
    progress: input.time,
    durationSeconds: input.state.duration || 0,
    isPlaying: input.state.isPlaying,
    now,
  })
    .then((result) => {
      if (detachMissingSession(result, input.detachSessionPersistence)) {
        return
      }
      log(`[PlayerStore] Saved progress: ${input.time.toFixed(1)}s`)
    })
    .catch((err) => {
      if (!isAbortLikeError(err)) warn('[PlayerStore] Failed to save progress:', err)
    })
}

export async function persistPlayerEndedProgress(input: {
  sessionId: string | null
  duration: number
  detachSessionPersistence: () => void
}): Promise<void> {
  if (!input.sessionId) return

  try {
    const result = await persistEndedPlaybackProgress({
      sessionId: input.sessionId,
      durationSeconds: input.duration || 0,
    })
    detachMissingSession(result, input.detachSessionPersistence)
  } catch (err) {
    if (!isAbortLikeError(err)) {
      warn('[PlayerStore] Failed to persist ended playback completion:', err)
    }
  }
}

export async function persistPlayerProgressOnUnmount(input: {
  signal?: AbortSignal
  state: {
    sessionId: string | null
    progress: number
    duration: number
    isPlaying: boolean
  }
  detachSessionPersistence: () => void
}): Promise<void> {
  if (!input.state.sessionId || input.state.progress <= 0 || input.signal?.aborted) return

  try {
    const result = await persistPlaybackProgressSnapshot({
      sessionId: input.state.sessionId,
      progress: input.state.progress,
      durationSeconds: input.state.duration || 0,
      isPlaying: input.state.isPlaying,
      now: Date.now(),
    })
    detachMissingSession(result, input.detachSessionPersistence)
  } catch (err) {
    if (!isAbortLikeError(err)) {
      warn('[PlayerStore] Failed to save progress on unmount:', err)
    }
  }
}
