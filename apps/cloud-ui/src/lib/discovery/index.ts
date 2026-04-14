import type { PodcastIndexFeedSummary } from './cloudApi'
import {
  fetchPodcastFeed as fetchCloudPodcastFeed,
  fetchTopEpisodes as fetchCloudTopEpisodes,
  fetchTopPodcasts as fetchCloudTopPodcasts,
  getPodcastIndexEpisodeByGuid as getCloudPodcastIndexEpisodeByGuid,
  getPodcastIndexEpisodes as getCloudPodcastIndexEpisodes,
  getPodcastIndexPodcastByItunesId as getCloudPodcastIndexPodcastByItunesId,
  getPodcastIndexPodcastsBatchByGuid as getCloudPodcastIndexPodcastsBatchByGuid,
  searchEpisodes as searchCloudEpisodes,
  searchPodcasts as searchCloudPodcasts,
} from './cloudApi'
import {
  clearDiscoveryMemoryCache as clearCloudDiscoveryMemoryCache,
  DISCOVERY_CACHE_KEY_BUILDERS,
  DISCOVERY_CACHE_TTLS_MS,
  runDiscoveryCacheMaintenance as runCloudDiscoveryCacheMaintenance,
} from './discoveryCache'
import type {
  DiscoveryPodcast,
  DiscoveryRequestOptions,
  Episode,
  ParsedFeed,
  Podcast,
  SearchEpisode,
} from './providers/types'

function mapPodcastIndexFeedSummaryToDiscoveryPodcast(
  item: PodcastIndexFeedSummary
): DiscoveryPodcast {
  return {
    id: String(item.podcastItunesId || ''),
    title: item.title || '',
    author: item.author || '',
    image: item.artwork || item.image || '',
    url: item.link || item.url || '',
    genres: Object.entries(item.categories ?? {}).map(([genreId, name]) => ({
      genreId,
      name,
    })),
    description: item.description || '',
    feedUrl: item.url || '',
    feedId: String(item.id),
    podcastGuid: item.podcastGuid,
    podcastItunesId: item.podcastItunesId != null ? String(item.podcastItunesId) : undefined,
    episodeCount: item.episodeCount,
    language: item.language,
  }
}

const discovery = {
  // Config / ID
  providerId: 'cloud',

  // Search (Apple first-hop via cloud relay)
  searchPodcasts: (
    query: string,
    country = 'us',
    limit = 30,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<Podcast[]>
  ) => {
    void options
    return searchCloudPodcasts(query, country, limit, signal)
  },

  searchEpisodes: (
    query: string,
    country = 'us',
    limit = 20,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<SearchEpisode[]>
  ) => {
    void options
    return searchCloudEpisodes(query, country, limit, signal)
  },

  // Detail / lookup (Podcast Index second-hop)
  getPodcastIndexPodcastByItunesId: (
    podcastItunesId: string,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<Podcast | null>
  ) => {
    void options
    return getCloudPodcastIndexPodcastByItunesId(podcastItunesId, signal)
  },

  getPodcastIndexPodcastsBatchByGuid: (
    guids: string[],
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<DiscoveryPodcast[]>
  ) => {
    void options
    return getCloudPodcastIndexPodcastsBatchByGuid(guids, signal).then((feeds) =>
      feeds.map(mapPodcastIndexFeedSummaryToDiscoveryPodcast)
    )
  },

  getPodcastIndexEpisodes: (
    id: string,
    limit = 300,
    signal?: AbortSignal
  ) => {
    return getCloudPodcastIndexEpisodes(id, limit, signal)
  },

  getPodcastIndexEpisodeByGuid: (
    episodeGuid: string,
    podcastId: string,
    signal?: AbortSignal
  ) => {
    return getCloudPodcastIndexEpisodeByGuid(episodeGuid, podcastId, signal)
  },

  // Feed
  fetchPodcastFeed: (
    feedUrl: string,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<ParsedFeed>
  ) => {
    void options
    return fetchCloudPodcastFeed(feedUrl, signal)
  },

  // Top charts (Apple first-hop via cloud relay)
  fetchTopPodcasts: (
    country = 'us',
    limit = 30,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<DiscoveryPodcast[]>
  ) => {
    void options
    return fetchCloudTopPodcasts(country, limit, signal)
  },

  fetchTopEpisodes: (
    country = 'us',
    limit = 30,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<DiscoveryPodcast[]>
  ) => {
    void options
    return fetchCloudTopEpisodes(country, limit, signal)
  },
}

export default discovery

export const runDiscoveryCacheMaintenance = runCloudDiscoveryCacheMaintenance
export const clearDiscoveryMemoryCache = clearCloudDiscoveryMemoryCache
export { DISCOVERY_CACHE_KEY_BUILDERS, DISCOVERY_CACHE_TTLS_MS }

// Re-export types for consumers
export type {
  DiscoveryPodcast,
  DiscoveryRequestOptions,
  Episode,
  ParsedFeed,
  Podcast,
  SearchEpisode,
}
