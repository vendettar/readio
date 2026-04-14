import type { EpisodeMetadata } from '../../store/playerStore'
import { usePlayerStore } from '../../store/playerStore'
import { normalizePodcastAudioUrl } from '../networking/urlUtils'

export interface PlaybackIdentitySnapshot {
  localTrackId: string | null
  audioUrl: string | null
  originalAudioUrl: string | null
  normalizedAudioUrl: string | null
  audioTitle: string
  episodeMetadata: EpisodeMetadata | null
  playbackIdentityKey: string
}

export function resolveCurrentPlaybackIdentity(
  state: ReturnType<typeof usePlayerStore.getState> = usePlayerStore.getState()
): PlaybackIdentitySnapshot | null {
  const localTrackId = state.localTrackId
  const audioUrl = state.audioUrl ?? null
  const originalAudioUrl = state.episodeMetadata?.originalAudioUrl ?? null
  const resolvedAudioUrl = originalAudioUrl || audioUrl

  if (!localTrackId && !resolvedAudioUrl) {
    return null
  }

  const normalizedAudioUrl = resolvedAudioUrl
    ? normalizePodcastAudioUrl(resolvedAudioUrl) || resolvedAudioUrl
    : null

  return {
    localTrackId,
    audioUrl,
    originalAudioUrl,
    normalizedAudioUrl,
    audioTitle: state.audioTitle,
    episodeMetadata: state.episodeMetadata ?? null,
    playbackIdentityKey: buildPlaybackIdentityKey({
      localTrackId,
      normalizedAudioUrl,
      audioUrl,
      originalAudioUrl,
    }),
  }
}

export function buildPlaybackIdentityKey(input: {
  localTrackId: string | null
  normalizedAudioUrl: string | null
  audioUrl?: string | null
  originalAudioUrl?: string | null
}): string {
  if (input.localTrackId) {
    return `local-track:${input.localTrackId}`
  }

  const normalizedAudioUrl =
    input.normalizedAudioUrl || input.originalAudioUrl || input.audioUrl || ''
  return `remote-playback:${normalizedAudioUrl}`
}

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
