// src/hooks/useDiscoveryPodcasts.ts
// TanStack Query hooks for Explore page data fetching

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getEditorPicksForRegion } from '../constants/app'
import discovery, { type DiscoveryPodcast } from '../lib/discovery'
import { NetworkError } from '../lib/fetchUtils'
import { getAppConfig } from '../lib/runtimeConfig'
import { useNetworkStatus } from './useNetworkStatus'

function isMockDataEnabled(): boolean {
  return getAppConfig().USE_MOCK_DATA
}

// Mock data generator
function generateMockPodcasts(count: number, prefix: string = 'Podcast'): DiscoveryPodcast[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `mock-${prefix}-${i + 1}`,
    name: `${prefix} ${i + 1}`,
    artistName: `Artist ${i + 1}`,
    artworkUrl100: `https://picsum.photos/seed/${prefix}${i}/200/200`,
    url: '#',
    genres: [{ genreId: '1', name: 'Mock Genre', url: '' }],
  }))
}

const MOCK_TOP_PODCASTS = generateMockPodcasts(30, 'Top Show')
const MOCK_EDITOR_PICKS = generateMockPodcasts(30, 'Editor Pick')
const MOCK_TOP_EPISODES = generateMockPodcasts(30, 'Episode')

// Query keys
const QUERY_KEYS = {
  topPodcasts: (country: string, limit: number) => ['topPodcasts', country, limit] as const,
  editorPicks: (country: string) => ['editorPicks', country] as const,
  topEpisodes: (country: string, limit: number) => ['topEpisodes', country, limit] as const,
}

/**
 * Hook for fetching Top Podcasts (overall chart)
 */
export function useTopPodcasts(country: string = 'us', limit: number = 25) {
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.topPodcasts(country, limit)

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      if (isMockDataEnabled()) return Promise.resolve(MOCK_TOP_PODCASTS.slice(0, limit))
      return discovery.fetchTopPodcasts(country, limit, signal, {
        onBackgroundRefresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh)
        },
      })
    },
    enabled: isOnline,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: (failureCount, error) => {
      if (isMockDataEnabled()) return false
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
 * Hook for fetching Editor's Picks (curated list by region)
 * Returns empty array if region has no configured picks
 */
export function useEditorPicks(country: string = 'us') {
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.editorPicks(country)

  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (isMockDataEnabled()) return MOCK_EDITOR_PICKS

      // Get region-specific Editor's Picks
      const picks = getEditorPicksForRegion(country)
      return picks
        ? discovery.lookupPodcastsByIds([...picks], country, signal, {
            onBackgroundRefresh: (fresh) => {
              queryClient.setQueryData(queryKey, fresh)
            },
          })
        : []
    },
    enabled: isOnline,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: (failureCount, error) => {
      if (isMockDataEnabled()) return false
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
 * Hook for fetching Top Episodes
 */
export function useTopEpisodes(country: string = 'us', limit: number = 25) {
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.topEpisodes(country, limit)

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      if (isMockDataEnabled()) return Promise.resolve(MOCK_TOP_EPISODES.slice(0, limit))
      return discovery.fetchTopEpisodes(country, limit, signal, {
        onBackgroundRefresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh)
        },
      })
    },
    enabled: isOnline,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: (failureCount, error) => {
      if (isMockDataEnabled()) return false
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

// Re-export types and utils

export type { DiscoveryPodcast }
