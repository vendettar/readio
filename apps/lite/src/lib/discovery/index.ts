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
  ) => provider.searchPodcasts(query, country, limit, signal, options),

  searchEpisodes: (
    query: string,
    country = 'us',
    limit = 20,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<SearchEpisode[]>
  ) => provider.searchEpisodes(query, country, limit, signal, options),

  // Lookup / Get
  getPodcast: (
    id: string,
    country = 'us',
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<Podcast | null>
  ) => provider.lookupPodcast(id, country, signal, options),

  getPodcastEpisodes: (
    id: string,
    country = 'us',
    limit = 50,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<Episode[]>
  ) => provider.lookupPodcastEpisodes(id, country, limit, signal, options),

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
  ) => provider.lookupPodcastsByIds(ids, country, signal, options),

  // Feed
  fetchPodcastFeed: (
    feedUrl: string,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<ParsedFeed>
  ) => provider.fetchPodcastFeed(feedUrl, signal, options),

  // Top Charts
  fetchTopPodcasts: (
    country = 'us',
    limit = 30,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<DiscoveryPodcast[]>
  ) => provider.fetchTopPodcasts(country, limit, signal, options),

  fetchTopEpisodes: (
    country = 'us',
    limit = 30,
    signal?: AbortSignal,
    options?: DiscoveryRequestOptions<DiscoveryPodcast[]>
  ) => provider.fetchTopEpisodes(country, limit, signal, options),

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
