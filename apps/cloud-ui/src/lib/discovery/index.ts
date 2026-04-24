import {
  fetchPodcastFeed as fetchCloudPodcastFeed,
  fetchTopEpisodes as fetchCloudTopEpisodes,
  fetchTopPodcasts as fetchCloudTopPodcasts,
  getPodcastIndexPodcastByItunesId as getCloudPodcastIndexPodcastByItunesId,
  getPodcastIndexPodcastsBatchByGuid as getCloudPodcastIndexPodcastsBatchByGuid,
  searchEpisodes as searchCloudEpisodes,
  searchPodcasts as searchCloudPodcasts,
} from './cloudApi'
import type { PodcastFeedPageOptions } from './cloudApi'
import {
  type EpisodeCommonFields,
  mapSessionToDiscovery,
  mapTrackToDiscovery,
  toEpisodeCommonFields,
} from './mappers'
import type {
  EditorPickPodcast,
  FavoriteEpisodeInput,
  FeedEpisode,
  ParsedFeed,
  PlaybackEpisodeStub,
  PlaybackPodcastStub,
  Podcast,
  SearchEpisode,
  SearchPodcast,
  TopEpisode,
  TopPodcast,
} from './schema'

const discovery = {
  // Search (Apple first-hop via cloud relay)
  searchPodcasts: (query: string, country = 'us', signal?: AbortSignal) => {
    return searchCloudPodcasts(query, country, signal)
  },

  searchEpisodes: (query: string, country = 'us', signal?: AbortSignal) => {
    return searchCloudEpisodes(query, country, signal)
  },

  // Canonical podcast detail / lookup
  getPodcastIndexPodcastByItunesId: (podcastItunesId: string, signal?: AbortSignal) => {
    return getCloudPodcastIndexPodcastByItunesId(podcastItunesId, signal)
  },

  getPodcastIndexPodcastsBatchByGuid: (guids: string[], signal?: AbortSignal) => {
    return getCloudPodcastIndexPodcastsBatchByGuid(guids, signal)
  },

  // Feed
  fetchPodcastFeed: (feedUrl: string, signal?: AbortSignal, options?: PodcastFeedPageOptions) => {
    return fetchCloudPodcastFeed(feedUrl, signal, options)
  },

  // Top charts (Apple first-hop via cloud relay)
  fetchTopPodcasts: (country = 'us', signal?: AbortSignal) => {
    return fetchCloudTopPodcasts(country, signal)
  },

  fetchTopEpisodes: (country = 'us', signal?: AbortSignal) => {
    return fetchCloudTopEpisodes(country, signal)
  },
}

export default discovery

// Re-export types for consumers
export type {
  EditorPickPodcast,
  FeedEpisode,
  ParsedFeed,
  Podcast,
  SearchEpisode,
  SearchPodcast,
  TopEpisode,
  TopPodcast,
  PlaybackPodcastStub,
  PlaybackEpisodeStub,
  FavoriteEpisodeInput,
}

// Re-export adapter utilities
export { toEpisodeCommonFields, mapTrackToDiscovery, mapSessionToDiscovery }
export type { EpisodeCommonFields }
