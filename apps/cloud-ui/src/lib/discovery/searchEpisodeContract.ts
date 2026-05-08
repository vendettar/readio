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
  pubDate: string
  durationSeconds: number | undefined
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
    pubDate: episode.releaseDate,
    durationSeconds:
      typeof episode.trackTimeMillis === 'number'
        ? Math.round(episode.trackTimeMillis / 1000)
        : undefined,
  }
}
