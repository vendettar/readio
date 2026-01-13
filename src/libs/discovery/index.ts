import { appleProvider } from './providers/apple'
import type {
  DiscoveryPodcast,
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
  searchPodcasts: (query: string, country = 'us', limit = 30, signal?: AbortSignal) =>
    provider.searchPodcasts(query, country, limit, signal),

  searchEpisodes: (query: string, country = 'us', limit = 20, signal?: AbortSignal) =>
    provider.searchEpisodes(query, country, limit, signal),

  // Lookup / Get
  getPodcast: (id: string, country = 'us', signal?: AbortSignal) =>
    provider.lookupPodcast(id, country, signal),

  getPodcastEpisodes: (id: string, country = 'us', limit = 50, signal?: AbortSignal) =>
    provider.lookupPodcastEpisodes(id, country, limit, signal),

  // Legacy/Helper methods (exposed for compatibility, can be refactored later)
  lookupEpisode: (id: string, country = 'us', signal?: AbortSignal) =>
    provider.lookupEpisode(id, country, signal),

  lookupPodcastsByIds: (ids: string[], country = 'us', signal?: AbortSignal) =>
    provider.lookupPodcastsByIds(ids, country, signal),

  // Feed
  fetchPodcastFeed: (feedUrl: string, signal?: AbortSignal) =>
    provider.fetchPodcastFeed(feedUrl, signal),

  // Top Charts
  fetchTopPodcasts: (country = 'us', limit = 30, signal?: AbortSignal) =>
    provider.fetchTopPodcasts(country, limit, signal),

  fetchTopEpisodes: (country = 'us', limit = 30, signal?: AbortSignal) =>
    provider.fetchTopEpisodes(country, limit, signal),

  fetchTopSubscriberPodcasts: (country = 'us', limit = 30, signal?: AbortSignal) =>
    provider.fetchTopSubscriberPodcasts(country, limit, signal),
}

export default discovery

// Re-export types for consumers
export type { DiscoveryPodcast, Episode, ParsedFeed, Podcast, SearchEpisode }
