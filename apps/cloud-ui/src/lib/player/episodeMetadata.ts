import type {
  CanonicalEpisodeMetadata,
  CanonicalRemoteEpisodeMetadata,
  EpisodeMetadata,
  LocalEpisodeMetadata,
} from './playbackMetadata'
import {
  createCanonicalEpisodeMetadata,
  createCanonicalRemoteEpisodeMetadata,
  createLocalEpisodeMetadata,
  normalizeCountryAtSave,
} from './playbackMetadata'
import type {
  ExplorePlaybackSession,
  Favorite,
  LocalPlaybackSession,
  PlaybackSession,
} from '../dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../discovery'
import { toCanonicalSearchEpisodeRecord } from '../discovery/searchEpisodeContract'
import { getDiscoveryArtworkUrl } from '../imageUtils'

export interface PlaybackPayload<TMetadata> {
  audioUrl: string
  title: string
  artwork: string
  metadata: TMetadata
  transcriptUrl?: string
}

export interface CanonicalPlaybackPayload extends PlaybackPayload<CanonicalEpisodeMetadata> {
  metadata: CanonicalEpisodeMetadata
}

export interface CanonicalRemotePlaybackPayload
  extends PlaybackPayload<CanonicalRemoteEpisodeMetadata> {
  metadata: CanonicalRemoteEpisodeMetadata
}

export interface LocalPlaybackPayload extends PlaybackPayload<LocalEpisodeMetadata> {
  metadata: LocalEpisodeMetadata
}

export type SessionPlaybackPayload = LocalPlaybackPayload | CanonicalRemotePlaybackPayload

function normalizeTimestamp(value: string | number | null | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (!value) return undefined
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : undefined
}

export function resolvePlaybackArtwork(source: string | undefined, size: number = 600): string {
  return getDiscoveryArtworkUrl(source, size)
}

export function mapEpisodeToPlaybackPayload(
  episode: Episode,
  podcast: Podcast
): CanonicalPlaybackPayload {
  const artwork = resolvePlaybackArtwork(episode.artworkUrl, 600)

  return {
    audioUrl: episode.audioUrl,
    title: episode.title,
    artwork,
    transcriptUrl: episode.transcriptUrl,
    metadata: createCanonicalEpisodeMetadata({
      description: episode.description,
      showTitle: podcast.title,
      artworkUrl: artwork,
      publishedAt: normalizeTimestamp(episode.pubDate),
      durationSeconds: episode.duration,
      episodeGuid: episode.guid,
      podcastItunesId: podcast.podcastItunesId,
      transcriptUrl: episode.transcriptUrl,
    }),
  }
}

export function mapSearchEpisodeToPlaybackPayload(
  episode: SearchEpisode
): CanonicalPlaybackPayload {
  const canonicalEpisode = toCanonicalSearchEpisodeRecord(episode)
  const artwork = resolvePlaybackArtwork(canonicalEpisode.artworkUrl, 600)

  return {
    audioUrl: canonicalEpisode.audioUrl,
    title: canonicalEpisode.title,
    artwork,
    transcriptUrl: undefined,
    metadata: createCanonicalEpisodeMetadata({
      description: canonicalEpisode.description,
      showTitle: canonicalEpisode.showTitle,
      artworkUrl: artwork,
      publishedAt: normalizeTimestamp(canonicalEpisode.pubDate),
      durationSeconds: canonicalEpisode.durationSeconds,
      episodeGuid: canonicalEpisode.episodeGuid,
      podcastItunesId: canonicalEpisode.podcastItunesId,
    }),
  }
}

export function mapFavoriteToPlaybackPayload(favorite: Favorite): CanonicalPlaybackPayload {
  const artwork = resolvePlaybackArtwork(favorite.episodeArtworkUrl, 600)

  return {
    audioUrl: favorite.audioUrl,
    title: favorite.episodeTitle,
    artwork,
    transcriptUrl: favorite.transcriptUrl,
    metadata: createCanonicalEpisodeMetadata({
      description: favorite.description,
      showTitle: favorite.podcastTitle,
      artworkUrl: artwork,
      publishedAt: normalizeTimestamp(favorite.pubDate),
      durationSeconds: favorite.durationSeconds,
      episodeGuid: favorite.episodeGuid,
      podcastItunesId: favorite.podcastItunesId,
      transcriptUrl: favorite.transcriptUrl,
    }),
  }
}

export function mapPlaybackSessionToEpisodeMetadata(
  session: ExplorePlaybackSession,
  artworkOverride?: string
): CanonicalRemoteEpisodeMetadata
export function mapPlaybackSessionToEpisodeMetadata(
  session: LocalPlaybackSession,
  artworkOverride?: string
): LocalEpisodeMetadata
export function mapPlaybackSessionToEpisodeMetadata(
  session: PlaybackSession,
  artworkOverride?: string
): EpisodeMetadata
export function mapPlaybackSessionToEpisodeMetadata(
  session: PlaybackSession,
  artworkOverride?: string
): EpisodeMetadata {
  if (session.source === 'explore') {
    const countryAtSave = normalizeCountryAtSave(session.countryAtSave)
    if (!countryAtSave) {
      throw new Error('Invalid explore playback session country snapshot')
    }
    const metadata = createCanonicalRemoteEpisodeMetadata({
      description: session.description,
      showTitle: session.showTitle,
      artworkUrl: artworkOverride ?? session.artworkUrl,
      publishedAt: normalizeTimestamp(session.publishedAt),
      durationSeconds: session.durationSeconds,
      episodeGuid: session.episodeGuid,
      podcastItunesId: session.podcastItunesId,
      transcriptUrl: session.transcriptUrl,
      countryAtSave,
      originalAudioUrl: session.audioUrl,
    })
    if (!metadata) {
      throw new Error('Invalid explore playback session metadata')
    }
    return metadata
  }

  return createLocalEpisodeMetadata({
    description: session.description,
    showTitle: session.showTitle,
    artworkUrl: artworkOverride ?? session.artworkUrl,
    publishedAt: normalizeTimestamp(session.publishedAt),
    durationSeconds: session.durationSeconds,
    transcriptUrl: session.transcriptUrl,
    originalAudioUrl: session.audioUrl,
  })
}

export function mapSessionToPlaybackPayload(
  session: ExplorePlaybackSession
): CanonicalRemotePlaybackPayload | null
export function mapSessionToPlaybackPayload(session: LocalPlaybackSession): LocalPlaybackPayload | null
export function mapSessionToPlaybackPayload(session: PlaybackSession): SessionPlaybackPayload | null
export function mapSessionToPlaybackPayload(
  session: PlaybackSession
): SessionPlaybackPayload | null {
  if (!session.audioUrl) return null

  const artwork = session.artworkUrl ?? ''
  if (session.source === 'explore') {
    return {
      audioUrl: session.audioUrl,
      title: session.title,
      artwork,
      transcriptUrl: session.transcriptUrl,
      metadata: mapPlaybackSessionToEpisodeMetadata(session, artwork),
    }
  }

  return {
    audioUrl: session.audioUrl,
    title: session.title,
    artwork,
    transcriptUrl: session.transcriptUrl,
    metadata: mapPlaybackSessionToEpisodeMetadata(session, artwork),
  }
}
