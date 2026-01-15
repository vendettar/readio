import type { DiscoveryPodcast, Episode, ParsedFeed, Podcast, SearchEpisode } from '@readio/core'

export type { DiscoveryPodcast, Episode, ParsedFeed, Podcast, SearchEpisode }

export type ProviderId = 'apple'

export interface DiscoveryProvider {
  id: ProviderId

  /**
   * Search for podcasts by keyword
   */
  searchPodcasts(
    query: string,
    country: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<Podcast[]>

  /**
   * Search for episodes by keyword
   */
  searchEpisodes(
    query: string,
    country: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<SearchEpisode[]>

  /**
   * Lookup a specific podcast by ID
   */
  lookupPodcast(id: string, country: string, signal?: AbortSignal): Promise<Podcast | null>

  /**
   * Lookup episodes for a specific podcast by ID
   */
  lookupPodcastEpisodes(
    id: string,
    country: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<Episode[]>

  /**
   * Lookup a specific episode by ID (Provider specific or global ID)
   */
  lookupEpisode(id: string, country: string, signal?: AbortSignal): Promise<Episode | null>

  /**
   * Lookup multiple podcasts by IDs
   */
  lookupPodcastsByIds(
    ids: string[],
    country: string,
    signal?: AbortSignal
  ): Promise<DiscoveryPodcast[]>

  /**
   * Fetch and parse a podcast RSS feed
   */
  fetchPodcastFeed(feedUrl: string, signal?: AbortSignal): Promise<ParsedFeed>

  /**
   * Get top charts for podcasts
   */
  fetchTopPodcasts(
    country: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<DiscoveryPodcast[]>

  /**
   * Get top charts for episodes
   */
  fetchTopEpisodes(
    country: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<DiscoveryPodcast[]>

  /**
   * Get top subscriber podcasts (Editor's Picks / Featured)
   */
  fetchTopSubscriberPodcasts(
    country: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<DiscoveryPodcast[]>
}
