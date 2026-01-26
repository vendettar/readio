import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import discovery from '../lib/discovery'
import { NetworkError } from '../lib/fetchUtils'
import { getAppConfig } from '../lib/runtimeConfig'
import { useExploreStore } from '../store/exploreStore'
import { useNetworkStatus } from './useNetworkStatus'

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
  const debouncedQuery = useDebouncedValue(normalizedQuery, 200)
  const shouldSearch = isOnline && enabled && debouncedQuery.length >= 2

  // Discovery Provider: Podcast Search (Debounced)
  const { data: podcasts = [], isLoading: isLoadingPodcasts } = useQuery({
    queryKey: ['globalSearch', 'podcasts', debouncedQuery, country],
    queryFn: ({ signal }) => discovery.searchPodcasts(debouncedQuery, country, 20, signal),
    enabled: shouldSearch,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: (failureCount, error) => {
      if (error instanceof NetworkError || error.name === 'NetworkError') return false
      return failureCount < 1
    },
  })

  // Discovery Provider: Episode Search (Debounced)
  const { data: episodes = [], isLoading: isLoadingEpisodes } = useQuery({
    queryKey: ['globalSearch', 'episodes', debouncedQuery, country],
    queryFn: ({ signal }) => discovery.searchEpisodes(debouncedQuery, country, 50, signal),
    enabled: shouldSearch,
    staleTime: 5 * 60 * 1000,
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
