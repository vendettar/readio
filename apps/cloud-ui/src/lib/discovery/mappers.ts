import type { PlaybackSession, PodcastDownload } from '../db/types'
import type { Episode, Podcast } from './providers/types'

/**
 * Validates and converts a provider ID string/number to a positive integer.
 * Avoids NaN and sentinel 0.
 */
function parseProviderId(id: string | number | null | undefined): number | undefined {
  if (id === null || id === undefined) return undefined
  const num = Number(id)
  return Number.isFinite(num) && num > 0 ? num : undefined
}

/**
 * Maps a PodcastDownload (from tracks table) to Discovery models
 * to avoid "as unknown as" casting in the UI layer.
 */
export function mapTrackToDiscovery(track: PodcastDownload): {
  podcast: Podcast
  episode: Episode
} {
  const podcast: Podcast = {
    providerPodcastId: parseProviderId(track.sourceProviderPodcastId),
    collectionName: track.sourcePodcastTitle || track.name,
    feedUrl: track.sourceFeedUrl || '',
    artworkUrl100: track.sourceArtworkUrl || '',
    artworkUrl600: track.sourceArtworkUrl || '',
    genres: [],
  }

  const episode: Episode = {
    id: track.sourceProviderEpisodeId || track.id,
    title: track.sourceEpisodeTitle || track.name,
    audioUrl: track.sourceUrlNormalized || '',
    description: track.sourceDescription || '',
    artworkUrl: track.sourceArtworkUrl,
    duration: track.durationSeconds || 0,
    pubDate: track.downloadedAt
      ? new Date(track.downloadedAt).toISOString()
      : new Date().toISOString(),
    providerEpisodeId: track.sourceProviderEpisodeId,
  }

  return { podcast, episode }
}

/**
 * Maps a PlaybackSession to Discovery models.
 */
export function mapSessionToDiscovery(session: PlaybackSession): {
  podcast: Podcast
  episode: Episode
} {
  const podcast: Podcast = {
    providerPodcastId: parseProviderId(session.providerPodcastId),
    collectionName: session.podcastTitle || session.title,
    feedUrl: session.podcastFeedUrl || '',
    artworkUrl100: session.artworkUrl || '',
    artworkUrl600: session.artworkUrl || '',
    genres: [],
  }

  const episode: Episode = {
    id: session.episodeId || session.id,
    title: session.title,
    audioUrl: session.audioUrl || '',
    description: session.description || '',
    artworkUrl: session.artworkUrl,
    duration: session.durationSeconds || 0,
    pubDate: session.publishedAt
      ? new Date(session.publishedAt).toISOString()
      : new Date().toISOString(),
    providerEpisodeId: session.providerEpisodeId,
    transcriptUrl: session.transcriptUrl,
  }

  return { podcast, episode }
}
