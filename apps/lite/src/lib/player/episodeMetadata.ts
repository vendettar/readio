import type { EpisodeMetadata } from '../../store/playerStore'
import type { Favorite, PlaybackSession } from '../dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../discovery'
import { normalizeFeedUrl } from '../discovery/feedUrl'
import { getDiscoveryArtworkUrl } from '../imageUtils'

export interface PlaybackPayload {
  audioUrl: string
  title: string
  artwork: string
  metadata: EpisodeMetadata
  transcriptUrl?: string
}

function normalizeTimestamp(value: string | number | null | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (!value) return undefined
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeProviderId(value: string | number | null | undefined): string | undefined {
  if (value == null) return undefined
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

export function resolvePlaybackArtwork(source: string | undefined, size: number = 600): string {
  return getDiscoveryArtworkUrl(source, size)
}

export function mapFeedEpisodeToPlaybackPayload(
  episode: Episode,
  podcast: Podcast
): PlaybackPayload {
  const artwork = resolvePlaybackArtwork(
    episode.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100,
    600
  )

  return {
    audioUrl: episode.audioUrl,
    title: episode.title,
    artwork,
    transcriptUrl: episode.transcriptUrl,
    metadata: {
      description: episode.description,
      podcastTitle: podcast.collectionName,
      podcastFeedUrl: normalizeFeedUrl(podcast.feedUrl ?? ''),
      artworkUrl: artwork,
      publishedAt: normalizeTimestamp(episode.pubDate),
      durationSeconds: episode.duration || 0,
      episodeId: episode.id,
      providerPodcastId: normalizeProviderId(podcast.providerPodcastId),
      providerEpisodeId: normalizeProviderId(episode.providerEpisodeId),
      transcriptUrl: episode.transcriptUrl,
    },
  }
}

export function mapSearchEpisodeToPlaybackPayload(
  episode: SearchEpisode,
  feedUrl?: string
): PlaybackPayload {
  const artwork = resolvePlaybackArtwork(episode.artworkUrl600 || episode.artworkUrl100, 600)
  const episodeId = episode.episodeGuid || normalizeProviderId(episode.providerEpisodeId)

  return {
    audioUrl: episode.episodeUrl,
    title: episode.trackName,
    artwork,
    transcriptUrl: undefined,
    metadata: {
      description: episode.description,
      podcastTitle: episode.collectionName,
      podcastFeedUrl: normalizeFeedUrl(feedUrl || episode.feedUrl || ''),
      artworkUrl: artwork,
      publishedAt: normalizeTimestamp(episode.releaseDate),
      durationSeconds: episode.trackTimeMillis
        ? Math.round(episode.trackTimeMillis / 1000)
        : undefined,
      episodeId,
      providerPodcastId: normalizeProviderId(episode.providerPodcastId),
      providerEpisodeId: normalizeProviderId(episode.providerEpisodeId),
    },
  }
}

export function mapFavoriteToPlaybackPayload(favorite: Favorite): PlaybackPayload {
  const artwork = resolvePlaybackArtwork(favorite.episodeArtworkUrl || favorite.artworkUrl, 600)

  return {
    audioUrl: favorite.audioUrl,
    title: favorite.episodeTitle,
    artwork,
    transcriptUrl: favorite.transcriptUrl,
    metadata: {
      description: favorite.description,
      podcastTitle: favorite.podcastTitle,
      podcastFeedUrl: normalizeFeedUrl(favorite.feedUrl),
      artworkUrl: artwork,
      publishedAt: normalizeTimestamp(favorite.pubDate),
      durationSeconds: favorite.durationSeconds,
      episodeId: favorite.episodeId,
      providerPodcastId: normalizeProviderId(favorite.providerPodcastId),
      providerEpisodeId: normalizeProviderId(favorite.providerEpisodeId),
      transcriptUrl: favorite.transcriptUrl,
    },
  }
}

export function mapPlaybackSessionToEpisodeMetadata(
  session: PlaybackSession,
  artworkOverride?: string
): EpisodeMetadata {
  const artwork = artworkOverride ?? session.artworkUrl ?? ''

  return {
    description: session.description,
    podcastTitle: session.podcastTitle,
    podcastFeedUrl: session.podcastFeedUrl,
    artworkUrl: artwork,
    publishedAt: normalizeTimestamp(session.publishedAt),
    durationSeconds: session.durationSeconds,
    episodeId: session.episodeId,
    providerPodcastId: normalizeProviderId(session.providerPodcastId),
    providerEpisodeId: normalizeProviderId(session.providerEpisodeId),
    transcriptUrl: session.transcriptUrl,
    countryAtSave: session.countryAtSave,
    originalAudioUrl: session.audioUrl,
  }
}

export function mapSessionToPlaybackPayload(session: PlaybackSession): PlaybackPayload | null {
  if (!session.audioUrl) return null

  const artwork = session.artworkUrl || ''

  return {
    audioUrl: session.audioUrl,
    title: session.title,
    artwork,
    transcriptUrl: session.transcriptUrl,
    metadata: mapPlaybackSessionToEpisodeMetadata(session, artwork),
  }
}
