import {
  fetchPodcastFeed as fetchCloudPodcastFeed,
  fetchTopEpisodes as fetchCloudTopEpisodes,
  fetchTopPodcasts as fetchCloudTopPodcasts,
  getPodcast as getCloudPodcast,
  getPodcastEpisodes as getCloudPodcastEpisodes,
  lookupPodcastsByIds as lookupCloudPodcastsByIds,
  searchEpisodes as searchCloudEpisodes,
  searchPodcasts as searchCloudPodcasts,
} from './cloudApi'
import {
  appleProvider,
  clearDiscoveryMemoryCache as clearAppleDiscoveryMemoryCache,
  DISCOVERY_CACHE_KEY_BUILDERS,
  DISCOVERY_CACHE_TTLS_MS,
  runDiscoveryCacheMaintenance as runAppleDiscoveryCacheMaintenance,
} from './providers/apple'
import type {
  DiscoveryPodcast,
  DiscoveryRequestOptions,
  Episode,
  ParsedFeed,
  Podcast,
  SearchEpisode,
} from './providers/types'

// Centralized provider selection
// In the future, this can be dynamic based on config
const provider = appleProvider

// Facade Layer
// Standardizes naming (get* instead of lookup*) and exposes provider functionality
const discovery = {
  // Config / ID
  providerId: provider.id,

  // Search
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

  // Lookup / Get
  getPodcast: (
    id: string,
    country = 'us',
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<Podcast | null>
  ) => {
    void options
    return getCloudPodcast(id, country, signal)
  },

  getPodcastEpisodes: (
    id: string,
    country = 'us',
    limit = 50,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<Episode[]>
  ) => {
    void options
    return getCloudPodcastEpisodes(id, country, limit, signal)
  },

  // Legacy/Helper methods (exposed for compatibility, can be refactored later)
  lookupEpisode: (
    id: string,
    country = 'us',
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<Episode | null>
  ) => provider.lookupEpisode(id, country, signal, options),

  lookupPodcastsByIds: (
    ids: string[],
    country = 'us',
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<DiscoveryPodcast[]>
  ) => {
    void options
    return lookupCloudPodcastsByIds(ids, country, signal)
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

  // Top Charts
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

  fetchTopSubscriberPodcasts: (country = 'us', limit = 30, signal?: AbortSignal) =>
    provider.fetchTopSubscriberPodcasts(country, limit, signal),
}

export default discovery

export const runDiscoveryCacheMaintenance = runAppleDiscoveryCacheMaintenance
export const clearDiscoveryMemoryCache = clearAppleDiscoveryMemoryCache
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
