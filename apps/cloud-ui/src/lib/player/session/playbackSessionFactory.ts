import type { FileTrack, PlaybackSessionCreateInput } from '../../dexieDb'
import type { CanonicalRemoteEpisodeMetadata, EpisodeMetadata } from '../playbackMetadata'
import {
  isCanonicalRemoteEpisodeMetadata,
  normalizePlaybackAudioUrl,
} from '../playbackMetadata'

function normalizeRequiredSessionField(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

export function resolveSessionAudioSnapshot(
  audioUrl: string | null | undefined,
  metadata?: { originalAudioUrl?: string } | null
): string | undefined {
  return (
    normalizePlaybackAudioUrl(metadata?.originalAudioUrl) ?? normalizePlaybackAudioUrl(audioUrl)
  )
}

export function buildManagedPlaybackSessionCreateInput(input: {
  id: string
  audioTitle: string
  durationSeconds: number
  normalizedAudioUrl?: string
  localTrackId?: string | null
  coverArtUrl?: string | Blob | null
  metadata?: EpisodeMetadata | null
}): PlaybackSessionCreateInput | null {
  const metadata = input.metadata
  const normalizedAudioUrl = normalizePlaybackAudioUrl(input.normalizedAudioUrl)

  if (isCanonicalRemoteEpisodeMetadata(metadata)) {
    if (!normalizedAudioUrl) {
      return null
    }

    const remoteMetadata: CanonicalRemoteEpisodeMetadata = metadata

    return {
      id: input.id,
      source: 'explore',
      title: input.audioTitle,
      progress: 0,
      durationSeconds: input.durationSeconds,
      audioUrl: normalizedAudioUrl,
      audioFilename: input.audioTitle,
      localTrackId: input.localTrackId || undefined,
      artworkUrl: remoteMetadata.artworkUrl,
      description: remoteMetadata.description,
      showTitle: remoteMetadata.showTitle,
      transcriptUrl: remoteMetadata.transcriptUrl,
      publishedAt: remoteMetadata.publishedAt,
      episodeGuid: remoteMetadata.episodeGuid,
      podcastItunesId: remoteMetadata.podcastItunesId,
      countryAtSave: remoteMetadata.countryAtSave,
    }
  }

  const artworkUrl =
    normalizeRequiredSessionField(metadata?.artworkUrl) ||
    (typeof input.coverArtUrl === 'string'
      ? normalizeRequiredSessionField(input.coverArtUrl)
      : undefined)
  const showTitle = normalizeRequiredSessionField(metadata?.showTitle)

  return {
    id: input.id,
    source: 'local',
    title: input.audioTitle,
    progress: 0,
    durationSeconds: input.durationSeconds,
    audioUrl: normalizedAudioUrl,
    audioFilename: input.audioTitle,
    localTrackId: input.localTrackId || undefined,
    artworkUrl,
    description: input.metadata?.description,
    showTitle,
    transcriptUrl: input.metadata?.transcriptUrl,
    publishedAt: input.metadata?.publishedAt,
  }
}

export function buildLocalTrackPlaybackSessionCreateInput(input: {
  sessionId: string
  track: FileTrack
  subtitleId: string | null
  artworkUrl?: string
}): PlaybackSessionCreateInput {
  return {
    id: input.sessionId,
    source: 'local',
    title: input.track.name,
    audioId: input.track.audioId,
    artworkUrl: input.artworkUrl,
    subtitleId: input.subtitleId,
    hasAudioBlob: true,
    lastPlayedAt: Date.now(),
    localTrackId: input.track.id,
    description: input.track.album || undefined,
    showTitle: input.track.artist || undefined,
    durationSeconds: input.track.durationSeconds || 0,
  }
}
