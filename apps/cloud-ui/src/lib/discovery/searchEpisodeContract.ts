import type { SearchEpisode } from './schema'

export interface CanonicalSearchEpisodeIdentity {
  podcastItunesId: string
  episodeGuid: string
}

export interface CanonicalSearchEpisodeRecord extends CanonicalSearchEpisodeIdentity {
  title: string
  showTitle: string
  artworkUrl: string
  audioUrl: string
  description: string
  pubDate: number
  durationSeconds: number | undefined
}

function parseReleaseDateToUnixSeconds(releaseDate: string): number {
  const milliseconds = Date.parse(releaseDate)
  if (!Number.isFinite(milliseconds)) {
    throw new Error('SearchEpisode releaseDate must be a valid timestamp')
  }
  return Math.floor(milliseconds / 1000)
}

export function getCanonicalSearchEpisodeIdentity(
  episode: Pick<SearchEpisode, 'podcastItunesId' | 'guid'>
): CanonicalSearchEpisodeIdentity {
  return {
    podcastItunesId: episode.podcastItunesId,
    episodeGuid: episode.guid,
  }
}

export function toCanonicalSearchEpisodeRecord(
  episode: SearchEpisode
): CanonicalSearchEpisodeRecord {
  return {
    ...getCanonicalSearchEpisodeIdentity(episode),
    title: episode.title,
    showTitle: episode.showTitle,
    artworkUrl: episode.artwork,
    audioUrl: episode.audioUrl,
    description: episode.shortDescription,
    pubDate: parseReleaseDateToUnixSeconds(episode.releaseDate),
    durationSeconds:
      typeof episode.trackTimeMillis === 'number'
        ? Math.round(episode.trackTimeMillis / 1000)
        : undefined,
  }
}
