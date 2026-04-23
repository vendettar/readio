import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import discovery from '../lib/discovery'
import { NetworkError } from '../lib/fetchUtils'
import { getAppConfig } from '../lib/runtimeConfig'
import { useExploreStore } from '../store/exploreStore'
import { useNetworkStatus } from './useNetworkStatus'

const DISCOVERY_SEARCH_DEBOUNCE_MS = 300

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}

export function useDiscoverySearch(query: string, enabled = true) {
  const { isOnline } = useNetworkStatus()
  const country = useExploreStore((s) => s.country) || getAppConfig().DEFAULT_COUNTRY
  const normalizedQuery = query.toLowerCase().trim()
  const debouncedQuery = useDebouncedValue(normalizedQuery, DISCOVERY_SEARCH_DEBOUNCE_MS)
  const shouldSearch = isOnline && enabled && debouncedQuery.length >= 2
  const podcastsQueryKey = ['globalSearch', 'podcasts', debouncedQuery, country] as const
  const episodesQueryKey = ['globalSearch', 'episodes', debouncedQuery, country] as const

  // Discovery Provider: Podcast Search (Debounced)
  const { data: podcasts = [], isLoading: isLoadingPodcasts } = useQuery({
    queryKey: podcastsQueryKey,
    queryFn: ({ signal }) => discovery.searchPodcasts(debouncedQuery, country, signal),
    enabled: shouldSearch,
    staleTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: (failureCount, error) => {
      if (error instanceof NetworkError || error.name === 'NetworkError') return false
      return failureCount < 1
    },
  })

  // Discovery Provider: Episode Search (Debounced)
  const { data: episodes = [], isLoading: isLoadingEpisodes } = useQuery({
    queryKey: episodesQueryKey,
    queryFn: ({ signal }) => discovery.searchEpisodes(debouncedQuery, country, signal),
    enabled: shouldSearch,
    staleTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: (failureCount, error) => {
      if (error instanceof NetworkError || error.name === 'NetworkError') return false
      return failureCount < 1
    },
  })

  return {
    podcasts,
    episodes,
    isLoading: isLoadingPodcasts || isLoadingEpisodes,
  }
}
