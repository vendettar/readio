// src/hooks/usePodcastSearch.ts
// TanStack Query hook for podcast search

import { useQuery, useQueryClient } from '@tanstack/react-query'
import discovery, { type Podcast } from '../lib/discovery'

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
  const queryClient = useQueryClient()

  // Normalize query and country for consistent caching
  const normalizedQuery = query.toLowerCase().trim()
  const normalizedCountry = country.toLowerCase()
  const queryKey = ['podcastSearch', normalizedQuery, normalizedCountry] as const

  return useQuery<Podcast[], Error>({
    queryKey,
    queryFn: async ({ signal }) => {
      return discovery.searchPodcasts(normalizedQuery, normalizedCountry, 20, signal, {
        onBackgroundRefresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh)
        },
      })
    },
    enabled: enabled && normalizedQuery.length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  })
}
