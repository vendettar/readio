import { usePlayerStore } from '../../store/playerStore'
import { resolvePlaybackStateIdentity } from './metadata/playbackIdentityModel'
import type { EpisodeMetadataInput } from './playbackMetadata'

export interface PlaybackIdentitySnapshot {
  localTrackId: string | null
  audioUrl: string | null
  originalAudioUrl: string | null
  normalizedAudioUrl: string | null
  audioTitle: string
  episodeMetadata: EpisodeMetadataInput | null
  playbackIdentityKey: string
}

export function resolvePlaybackStateIdentityKey(
  state: Pick<
    ReturnType<typeof usePlayerStore.getState>,
    'localTrackId' | 'audioUrl' | 'episodeMetadata'
  > = usePlayerStore.getState()
): string | null {
  return (
    resolvePlaybackStateIdentity({
      localTrackId: state.localTrackId,
      audioUrl: state.audioUrl,
      metadata: state.episodeMetadata,
    })?.key ?? null
  )
}

export function resolveCurrentPlaybackIdentity(
  state: ReturnType<typeof usePlayerStore.getState> = usePlayerStore.getState()
): PlaybackIdentitySnapshot | null {
  const resolvedIdentity = resolvePlaybackStateIdentity({
    localTrackId: state.localTrackId,
    audioUrl: state.audioUrl,
    metadata: state.episodeMetadata,
  })
  if (!resolvedIdentity) {
    return null
  }

  return {
    localTrackId: resolvedIdentity.localTrackId,
    audioUrl: resolvedIdentity.audioUrl,
    audioTitle: state.audioTitle,
    originalAudioUrl: resolvedIdentity.originalAudioUrl,
    normalizedAudioUrl: resolvedIdentity.normalizedAudioUrl,
    episodeMetadata: state.episodeMetadata ?? null,
    playbackIdentityKey: resolvedIdentity.key,
  }
}

export { buildPlaybackIdentityKey } from './metadata/playbackIdentityModel'

export function resolvePlaybackExportBaseName(
  identity: PlaybackIdentitySnapshot | null,
  fallback = 'episode'
): string {
  const raw = identity?.audioTitle?.trim() || fallback
  return sanitizeExportFilenameSegment(raw) || fallback
}

export function sanitizeExportFilenameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}
