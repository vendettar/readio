import type { PlaybackSession } from '../../dexieDb'
import { resolvePlaybackStateIdentityKey } from '../playbackIdentity'
import { type EpisodeMetadataInput, normalizeEpisodeMetadata } from '../playbackMetadata'
import {
  CREATE_MANAGED_PLAYBACK_SESSION_REASON,
  createManagedPlaybackSession,
  findManagedPlaybackSessionCandidate,
} from './playerSessionManagementService'

type LivePlaybackState = {
  audioTitle: string
  audioUrl: string | null
  coverArtUrl: string | Blob | null
  localTrackId: string | null
  episodeMetadata: EpisodeMetadataInput | null
}

export type ManagedPlaybackSessionResolution =
  | {
      kind: 'stale'
    }
  | {
      kind: 'invalid_remote_metadata'
    }
  | {
      kind: 'existing'
      session: PlaybackSession
    }
  | {
      kind: 'created'
      sessionId: string
    }

export async function resolveManagedPlaybackSession(input: {
  durationSeconds: number
  liveState: LivePlaybackState
  fallbackLocalTrackId: string | null
  fallbackEpisodeMetadata: EpisodeMetadataInput | null
  getCurrentPlaybackIdentity: () => string
}): Promise<ManagedPlaybackSessionResolution> {
  const currentLocalTrackId = input.liveState.localTrackId ?? input.fallbackLocalTrackId
  const effectiveMetadata = input.liveState.episodeMetadata ?? input.fallbackEpisodeMetadata
  const normalizedMetadata = normalizeEpisodeMetadata(effectiveMetadata)
  const rejectedCanonicalRemoteMetadata = !!effectiveMetadata && !normalizedMetadata
  const currentIdentity =
    resolvePlaybackStateIdentityKey({
      localTrackId: currentLocalTrackId,
      audioUrl: input.liveState.audioUrl,
      episodeMetadata: normalizedMetadata ?? effectiveMetadata,
    }) ?? ''

  if (input.getCurrentPlaybackIdentity() !== currentIdentity) {
    return { kind: 'stale' }
  }
  if (rejectedCanonicalRemoteMetadata) {
    return { kind: 'invalid_remote_metadata' }
  }

  const existingSession = await findManagedPlaybackSessionCandidate({
    localTrackId: currentLocalTrackId,
    metadata: normalizedMetadata ?? undefined,
    audioUrl: input.liveState.audioUrl,
  })

  if (input.getCurrentPlaybackIdentity() !== currentIdentity) {
    return { kind: 'stale' }
  }

  if (existingSession) {
    return {
      kind: 'existing',
      session: existingSession,
    }
  }

  const created = await createManagedPlaybackSession({
    audioTitle: input.liveState.audioTitle,
    durationSeconds: input.durationSeconds,
    audioUrl: input.liveState.audioUrl,
    localTrackId: currentLocalTrackId,
    coverArtUrl: input.liveState.coverArtUrl,
    metadata: normalizedMetadata,
  })
  if (!created.ok) {
    if (created.reason === CREATE_MANAGED_PLAYBACK_SESSION_REASON.INVALID_REMOTE_METADATA) {
      return { kind: 'invalid_remote_metadata' }
    }
    return { kind: 'stale' }
  }

  if (input.getCurrentPlaybackIdentity() !== currentIdentity) {
    return { kind: 'stale' }
  }

  return {
    kind: 'created',
    sessionId: created.sessionId,
  }
}
