// src/hooks/useDiscoveryPodcasts.ts
// TanStack Query hooks for Explore page data fetching

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getEditorPicksForRegion, isPodcastGuid } from '../constants/app'
import discovery, { type DiscoveryPodcast } from '../lib/discovery'
import { NetworkError } from '../lib/fetchUtils'
import { useNetworkStatus } from './useNetworkStatus'

// Query keys
const QUERY_KEYS = {
  topPodcasts: (country: string, limit: number) => ['topPodcasts', country, limit] as const,
  editorPicks: (country: string) => ['editorPicks', country] as const,
  topEpisodes: (country: string, limit: number) => ['topEpisodes', country, limit] as const,
}

/**
 * Hook for fetching Top Podcasts (Apple chart)
 */
export function useTopPodcasts(country: string = 'us', limit: number = 25) {
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.topPodcasts(country, limit)

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      return discovery
        .fetchTopPodcasts(country, limit, signal, {
          onBackgroundRefresh: (fresh) => {
            queryClient.setQueryData(
              queryKey,
              fresh.filter((p) => p.podcastItunesId && p.podcastItunesId !== '0')
            )
          },
        })
        .then((fresh) => fresh.filter((p) => p.podcastItunesId && p.podcastItunesId !== '0'))
    },
    enabled: isOnline,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: (failureCount, error) => {
      // TypeError happens on true offline or severe CORS/Network issues - don't retry
      if (
        error instanceof NetworkError ||
        error.name === 'NetworkError' ||
        error instanceof TypeError
      )
        return false
      return failureCount < 2
    },
  })
}

/**
 * Hook for fetching Editor's Picks (PI batch-byguid)
 */
export function useEditorPicks(country: string = 'us') {
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.editorPicks(country)

  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const picks = getEditorPicksForRegion(country)
      if (!picks || picks.length === 0) return []

      const invalidPick = picks.find((pick) => !isPodcastGuid(pick))
      if (invalidPick) {
        throw new Error(`Editor pick must be a podcast guid: ${invalidPick}`)
      }

      const fresh = await discovery.getPodcastIndexPodcastsBatchByGuid([...picks], signal, {
        onBackgroundRefresh: (data) => {
          queryClient.setQueryData(queryKey, data)
        },
      })
      queryClient.setQueryData(queryKey, fresh)
      return fresh
    },
    enabled: isOnline,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: (failureCount, error) => {
      if (
        error instanceof NetworkError ||
        error.name === 'NetworkError' ||
        error instanceof TypeError
      ) {
        return false
      }
      return failureCount < 2
    },
  })
}

/**
 * Hook for fetching Top Episodes (Apple chart)
 */
export function useTopEpisodes(country: string = 'us', limit: number = 25) {
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.topEpisodes(country, limit)

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      return discovery
        .fetchTopEpisodes(country, limit, signal, {
          onBackgroundRefresh: (fresh) => {
            queryClient.setQueryData(
              queryKey,
              fresh.filter((p) => p.podcastItunesId && p.podcastItunesId !== '0')
            )
          },
        })
        .then((fresh) => fresh.filter((p) => p.podcastItunesId && p.podcastItunesId !== '0'))
    },
    enabled: isOnline,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: (failureCount, error) => {
      // TypeError happens on true offline or severe CORS/Network issues - don't retry
      if (
        error instanceof NetworkError ||
        error.name === 'NetworkError' ||
        error instanceof TypeError
      )
        return false
      return failureCount < 2
    },
  })
}

// Re-export types
export type { DiscoveryPodcast }
