import type { PlaybackSession, PodcastDownload } from '../db/types'
import type { Episode, Podcast } from './providers/types'

/**
 * Validates and converts a provider ID string/number to a positive integer.
 * Avoids NaN and sentinel 0.
 */
function parseProviderId(id: string | number | null | undefined): string | undefined {
  if (id === null || id === undefined) return undefined
  const s = String(id).trim()
  return s && s !== '0' && s !== 'NaN' ? s : undefined
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
    podcastItunesId: parseProviderId(track.sourcePodcastItunesId),
    title: track.sourcePodcastTitle || track.name,
    feedUrl: track.sourceFeedUrl || '',
    image: track.sourceArtworkUrl || '',
    genres: [],
  }

  const episode: Episode = {
    id: track.sourceEpisodeGuid || track.id,
    title: track.sourceEpisodeTitle || track.name,
    audioUrl: track.sourceUrlNormalized || '',
    description: track.sourceDescription || '',
    artworkUrl: track.sourceArtworkUrl,
    duration: track.durationSeconds || 0,
    pubDate: track.downloadedAt
      ? new Date(track.downloadedAt).toISOString()
      : new Date().toISOString(),
    episodeGuid: track.sourceEpisodeGuid,
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
    podcastItunesId: parseProviderId(session.podcastItunesId),
    title: session.podcastTitle || session.title,
    feedUrl: session.podcastFeedUrl || '',
    image: session.artworkUrl || '',
    genres: [],
  }

  const episode: Episode = {
    id: session.episodeGuid || session.id,
    title: session.title,
    audioUrl: session.audioUrl || '',
    description: session.description || '',
    artworkUrl: session.artworkUrl,
    duration: session.durationSeconds || 0,
    pubDate: session.publishedAt
      ? new Date(session.publishedAt).toISOString()
      : new Date().toISOString(),
    episodeGuid: session.episodeGuid,
    providerEpisodeId: session.providerEpisodeId,
    transcriptUrl: session.transcriptUrl,
  }

  return { podcast, episode }
}
