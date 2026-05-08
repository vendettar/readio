import type { PlaybackSession } from '../../dexieDb'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'
import { generateSessionId } from '../../session'
import type { EpisodeMetadata } from '../playbackMetadata'
import {
  isCanonicalRemoteEpisodeMetadata,
  PLAYBACK_METADATA_KIND,
} from '../playbackMetadata'
import {
  buildManagedPlaybackSessionCreateInput,
  resolveSessionAudioSnapshot,
} from './playbackSessionFactory'

export const CREATE_MANAGED_PLAYBACK_SESSION_REASON = {
  INVALID_REMOTE_METADATA: 'invalid_remote_metadata',
} as const

export type CreateManagedPlaybackSessionResult =
  | {
      ok: true
      sessionId: string
    }
  | {
      ok: false
      reason: (typeof CREATE_MANAGED_PLAYBACK_SESSION_REASON)[keyof typeof CREATE_MANAGED_PLAYBACK_SESSION_REASON]
    }

export async function findManagedPlaybackSessionCandidate(input: {
  localTrackId?: string | null
  metadata?: EpisodeMetadata | null
  audioUrl?: string | null
}): Promise<PlaybackSession | undefined> {
  if (input.localTrackId) {
    const directSession = await PlaybackRepository.getPlaybackSession(
      `local-track-${input.localTrackId}`
    )
    if (directSession) {
      return directSession
    }
    return PlaybackRepository.findLastSessionByTrackId(input.localTrackId)
  }

  if (isCanonicalRemoteEpisodeMetadata(input.metadata)) {
    return PlaybackRepository.findLastExploreSessionByCanonicalIdentity(
      input.metadata.podcastItunesId,
      input.metadata.episodeGuid
    )
  }

  const normalizedAudioUrl = resolveSessionAudioSnapshot(input.audioUrl, input.metadata)
  if (!normalizedAudioUrl) {
    return undefined
  }

  return PlaybackRepository.findLastSessionByUrl(normalizedAudioUrl)
}

export async function createManagedPlaybackSession(input: {
  audioTitle: string
  durationSeconds: number
  audioUrl?: string | null
  localTrackId?: string | null
  coverArtUrl?: string | Blob | null
  metadata?: EpisodeMetadata | null
}): Promise<CreateManagedPlaybackSessionResult> {
  if (
    input.metadata?.kind === PLAYBACK_METADATA_KIND.REMOTE_EPISODE &&
    !isCanonicalRemoteEpisodeMetadata(input.metadata)
  ) {
    return {
      ok: false,
      reason: CREATE_MANAGED_PLAYBACK_SESSION_REASON.INVALID_REMOTE_METADATA,
    }
  }

  const sessionInput = buildManagedPlaybackSessionCreateInput({
    id: generateSessionId(),
    audioTitle: input.audioTitle,
    durationSeconds: input.durationSeconds,
    normalizedAudioUrl: resolveSessionAudioSnapshot(input.audioUrl, input.metadata),
    localTrackId: input.localTrackId,
    coverArtUrl: input.coverArtUrl,
    metadata: input.metadata,
  })

  if (!sessionInput?.id) {
    return {
      ok: false,
      reason: CREATE_MANAGED_PLAYBACK_SESSION_REASON.INVALID_REMOTE_METADATA,
    }
  }

  await PlaybackRepository.upsertPlaybackSession(sessionInput)
  return {
    ok: true,
    sessionId: sessionInput.id,
  }
}
