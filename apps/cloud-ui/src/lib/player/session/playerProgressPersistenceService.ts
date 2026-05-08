import { PlaybackRepository } from '../../repositories/PlaybackRepository'

export const PERSIST_PLAYBACK_PROGRESS_REASON = {
  STORED: 'stored',
  SESSION_NOT_FOUND: 'session_not_found',
} as const

export type PersistPlaybackProgressReason =
  (typeof PERSIST_PLAYBACK_PROGRESS_REASON)[keyof typeof PERSIST_PLAYBACK_PROGRESS_REASON]

export interface PersistPlaybackProgressResult {
  ok: boolean
  reason: PersistPlaybackProgressReason
}

function isSessionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('Playback session') && error.message.includes('not found')
}

async function updatePlaybackSessionOrReportMissing(input: {
  sessionId: string
  updates: Parameters<typeof PlaybackRepository.updatePlaybackSession>[1]
}): Promise<PersistPlaybackProgressResult> {
  try {
    await PlaybackRepository.updatePlaybackSession(input.sessionId, input.updates)
    return {
      ok: true,
      reason: PERSIST_PLAYBACK_PROGRESS_REASON.STORED,
    }
  } catch (err) {
    if (isSessionNotFoundError(err)) {
      return {
        ok: false,
        reason: PERSIST_PLAYBACK_PROGRESS_REASON.SESSION_NOT_FOUND,
      }
    }
    throw err
  }
}

export function persistPlaybackProgressSnapshot(input: {
  sessionId: string
  progress: number
  durationSeconds: number
  isPlaying: boolean
  now: number
}): Promise<PersistPlaybackProgressResult> {
  return updatePlaybackSessionOrReportMissing({
    sessionId: input.sessionId,
    updates: {
      progress: input.progress,
      durationSeconds: input.durationSeconds,
      ...(input.isPlaying ? { lastPlayedAt: input.now } : {}),
    },
  })
}

export function persistEndedPlaybackProgress(input: {
  sessionId: string
  durationSeconds: number
}): Promise<PersistPlaybackProgressResult> {
  return updatePlaybackSessionOrReportMissing({
    sessionId: input.sessionId,
    updates: {
      progress: 0,
      durationSeconds: input.durationSeconds,
    },
  })
}
