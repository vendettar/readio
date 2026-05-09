import type { ASRCue } from '../asr/types'
import type { LocalPlaybackSession } from '../db/types'
import { logError } from '../logger'
import { mapPlaybackSessionToEpisodeMetadata } from './episodeMetadata'
import { bumpPlaybackEpoch, getPlaybackEpoch } from './remotePlayback'
import { loadSessionSubtitleCues } from './session/playerSessionSubtitleLoader'

const LOCAL_HISTORY_PLAYBACK_REASON = {
  STARTED: 'started',
  STALE: 'stale',
  MISSING_AUDIO_BLOB: 'missing_audio_blob',
  LOAD_FAILED: 'load_failed',
} as const

type LocalHistoryPlaybackReason =
  (typeof LOCAL_HISTORY_PLAYBACK_REASON)[keyof typeof LOCAL_HISTORY_PLAYBACK_REASON]
type LocalHistoryPlaybackNonStartReason = Exclude<
  LocalHistoryPlaybackReason,
  typeof LOCAL_HISTORY_PLAYBACK_REASON.STARTED
>

export type LocalHistoryPlaybackStartResult =
  | { started: true; reason: typeof LOCAL_HISTORY_PLAYBACK_REASON.STARTED }
  | { started: false; reason: LocalHistoryPlaybackNonStartReason }

type LocalHistoryPlaybackDeps = {
  scope: 'History' | 'LocalSearch'
  getAudioBlob: (audioId: string) => Promise<Blob | null>
  loadAudioBlob: (
    blob: Blob,
    title: string,
    artwork?: string | Blob | null,
    sessionId?: string | null,
    signal?: AbortSignal,
    metadata?: ReturnType<typeof mapPlaybackSessionToEpisodeMetadata> | null
  ) => Promise<void>
  setSubtitles: (subtitles: ASRCue[]) => void
  setPlaybackTrackId?: (id: string | null) => void
  applyStartedSurface: () => void
  play: () => void
  resolveArtwork: () => string | Blob | null
}

function createStartedResult(): LocalHistoryPlaybackStartResult {
  return { started: true, reason: LOCAL_HISTORY_PLAYBACK_REASON.STARTED }
}

function createNonStartedResult(
  reason: LocalHistoryPlaybackNonStartReason
): LocalHistoryPlaybackStartResult {
  return { started: false, reason }
}

export async function restoreLocalHistoryPlayback(
  session: LocalPlaybackSession,
  deps: LocalHistoryPlaybackDeps
): Promise<LocalHistoryPlaybackStartResult> {
  if (!session.audioId) {
    return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.LOAD_FAILED)
  }

  const currentEpoch = bumpPlaybackEpoch()

  let audioBlob: Blob | null = null
  try {
    audioBlob = await deps.getAudioBlob(session.audioId)
  } catch (error) {
    if (getPlaybackEpoch() !== currentEpoch) {
      return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.STALE)
    }
    if (import.meta.env.DEV) {
      logError(`[${deps.scope}] Failed to restore local history session`, {
        sessionId: session.id,
        audioId: session.audioId,
        error,
      })
    }
    return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.LOAD_FAILED)
  }

  if (getPlaybackEpoch() !== currentEpoch) {
    return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.STALE)
  }

  if (!audioBlob) {
    if (import.meta.env.DEV) {
      logError(`[${deps.scope}] Missing local audio blob for session playback`, {
        sessionId: session.id,
        audioId: session.audioId,
      })
    }
    return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.MISSING_AUDIO_BLOB)
  }

  try {
    await deps.loadAudioBlob(
      audioBlob,
      session.title,
      deps.resolveArtwork(),
      session.id,
      undefined,
      mapPlaybackSessionToEpisodeMetadata(session)
    )
  } catch (error) {
    if (getPlaybackEpoch() !== currentEpoch) {
      return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.STALE)
    }
    if (import.meta.env.DEV) {
      logError(`[${deps.scope}] Failed to load local audio blob`, {
        sessionId: session.id,
        audioId: session.audioId,
        error,
      })
    }
    return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.LOAD_FAILED)
  }

  if (getPlaybackEpoch() !== currentEpoch) {
    return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.STALE)
  }

  let subtitleCues: ASRCue[] | null = null
  try {
    subtitleCues = await loadSessionSubtitleCues(session)
  } catch (error) {
    if (import.meta.env.DEV) {
      logError(`[${deps.scope}] Failed to restore local subtitles`, {
        sessionId: session.id,
        subtitleId: session.subtitleId,
        error,
      })
    }
  }

  if (getPlaybackEpoch() !== currentEpoch) {
    return createNonStartedResult(LOCAL_HISTORY_PLAYBACK_REASON.STALE)
  }

  if (subtitleCues) {
    deps.setSubtitles(subtitleCues)
  }

  deps.setPlaybackTrackId?.(session.localTrackId ?? null)
  deps.applyStartedSurface()
  deps.play()

  return createStartedResult()
}
