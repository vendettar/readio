import type { PlaybackSession, PodcastDownload } from '../db/types'
import type { FeedEpisode } from './schema'

/**
 * Common episode fields shared by playback/favorite bridge code.
 * This is intentionally broader than the canonical RSS contract because
 * local/session records are partial persistence snapshots, not feed payloads.
 */
export type EpisodeCommonFields = {
  title?: string
  audioUrl?: string
  description?: string
  artworkUrl?: string
  duration?: number
  pubDate?: string
  episodeGuid?: string
  transcriptUrl?: string
}

function getEpisodeCommonFields(episode: FeedEpisode): EpisodeCommonFields {
  return {
    title: episode.title,
    audioUrl: episode.audioUrl,
    description: episode.description,
    artworkUrl: episode.artworkUrl,
    duration: episode.duration,
    pubDate: episode.pubDate,
    episodeGuid: episode.episodeGuid,
    transcriptUrl: episode.transcriptUrl,
  }
}

export function toEpisodeCommonFields(episode: FeedEpisode): EpisodeCommonFields {
  return getEpisodeCommonFields(episode)
}

function parseProviderId(id: string | number | null | undefined): string {
  if (id === null || id === undefined) return ''
  const s = String(id).trim()
  return s && s !== '0' && s !== 'NaN' ? s : ''
}

/**
 * Narrow internal adapter type for non-canonical contexts
 * where we only have partial podcast metadata from downloads/history.
 * This is a bridge type, not a discovery API contract.
 */
export interface PlaybackPodcastStub {
  podcastItunesId: string
  title: string
  author: string
  artwork: string
  feedUrl: string
}

/**
 * Narrow internal adapter type for non-canonical episode contexts
 * from local track/session data.
 */
export interface PlaybackEpisodeStub {
  episodeGuid?: string
  title: string
  audioUrl: string
  description?: string
  artworkUrl?: string
  duration: number
  pubDate: string
  transcriptUrl?: string
}

/**
 * Maps a PodcastDownload (from tracks table) to Discovery models.
 * Returns narrow bridge stubs, not canonical RSS discovery models.
 */
export function mapTrackToDiscovery(track: PodcastDownload): {
  podcast: PlaybackPodcastStub
  episode: PlaybackEpisodeStub
} {
  const podcast: PlaybackPodcastStub = {
    podcastItunesId: parseProviderId(track.sourcePodcastItunesId),
    title: track.sourcePodcastTitle || track.name,
    author: track.sourcePodcastTitle || '',
    artwork: track.sourceArtworkUrl || '',
    feedUrl: track.sourceFeedUrl || '',
  }

  const episode: PlaybackEpisodeStub = {
    episodeGuid: parseProviderId(track.sourceEpisodeGuid) || undefined,
    title: track.sourceEpisodeTitle || track.name,
    audioUrl: track.sourceUrlNormalized || '',
    description: track.sourceDescription,
    artworkUrl: track.sourceArtworkUrl,
    duration: track.durationSeconds || 0,
    pubDate: track.downloadedAt
      ? new Date(track.downloadedAt).toISOString()
      : new Date().toISOString(),
  }

  return { podcast, episode }
}

/**
 * Maps a PlaybackSession to Discovery models.
 * Returns narrow bridge stubs, not canonical RSS discovery models.
 */
export function mapSessionToDiscovery(session: PlaybackSession): {
  podcast: PlaybackPodcastStub
  episode: PlaybackEpisodeStub
} {
  const podcast: PlaybackPodcastStub = {
    podcastItunesId: parseProviderId(session.podcastItunesId),
    title: session.podcastTitle || session.title,
    author: session.podcastTitle || '',
    artwork: session.artworkUrl || '',
    feedUrl: session.podcastFeedUrl || '',
  }

  const episode: PlaybackEpisodeStub = {
    episodeGuid: parseProviderId(session.episodeGuid) || undefined,
    title: session.title,
    audioUrl: session.audioUrl || '',
    description: session.description,
    artworkUrl: session.artworkUrl,
    duration: session.durationSeconds || 0,
    pubDate: session.publishedAt
      ? new Date(session.publishedAt).toISOString()
      : new Date().toISOString(),
    transcriptUrl: session.transcriptUrl,
  }

  return { podcast, episode }
}
