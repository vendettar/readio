import type { DiscoveryPodcast, Episode, ParsedFeed, Podcast, SearchEpisode } from '../schema'

export type { DiscoveryPodcast, Episode, ParsedFeed, Podcast, SearchEpisode }

export interface DiscoveryRequestOptions<T> {
  onBackgroundRefresh?: (data: T) => void
}
