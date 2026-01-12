// src/hooks/usePodcastSearch.ts
// TanStack Query hook for podcast search

import { useQuery } from '@tanstack/react-query'
import { type Podcast, searchPodcasts } from '../libs/discoveryProvider'

export interface UsePodcastSearchOptions {
  enabled?: boolean
}

/**
 * TanStack Query hook for searching podcasts.
 *
 * Query key: ['podcastSearch', query, country]
 * - Automatically caches results
 * - Supports abort/cancel via signal
 * - Deduplicates concurrent requests
 *
 * @param query - Search term
 * @param country - Country code (e.g. 'us', 'cn')
 * @param options - Additional options
 */
export function usePodcastSearch(
  query: string,
  country: string,
  options: UsePodcastSearchOptions = {}
) {
  const { enabled = true } = options

  // Normalize query and country for consistent caching
  const normalizedQuery = query.toLowerCase().trim()
  const normalizedCountry = country.toLowerCase()

  return useQuery<Podcast[], Error>({
    queryKey: ['podcastSearch', normalizedQuery, normalizedCountry],
    queryFn: async ({ signal }) => {
      return searchPodcasts(normalizedQuery, normalizedCountry, 20, signal)
    },
    enabled: enabled && normalizedQuery.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  })
}
