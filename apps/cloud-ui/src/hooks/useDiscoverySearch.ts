import { useQuery } from '@tanstack/react-query'
import type { SearchEpisode, SearchPodcast } from '../lib/discovery'
import discovery from '../lib/discovery'
import { shouldRetryDiscoveryRequest } from '../lib/discovery/cloudApi'
import { getAppConfig } from '../lib/runtimeConfig'
import { useExploreStore } from '../store/exploreStore'
import {
  buildSearchSection,
  buildUnavailableSearchSection,
  hasActiveSearchQuery,
  isSearchSectionLoading,
  normalizeSearchQuery,
} from './searchSection'
import { useDebouncedValue } from './useDebouncedValue'
import { useNetworkStatus } from './useNetworkStatus'

const DISCOVERY_SEARCH_DEBOUNCE_MS = 300

export function useDiscoverySearch(query: string, enabled = true) {
  const { isOnline } = useNetworkStatus()
  const country = useExploreStore((s) => s.country) || getAppConfig().DEFAULT_COUNTRY
  const normalizedQuery = normalizeSearchQuery(query)
  const debouncedQuery = useDebouncedValue(normalizedQuery, DISCOVERY_SEARCH_DEBOUNCE_MS)
  const hasActiveQuery = enabled && hasActiveSearchQuery(debouncedQuery)
  const shouldSearch = isOnline && hasActiveQuery
  const podcastsQueryKey = ['globalSearch', 'podcasts', debouncedQuery, country] as const
  const episodesQueryKey = ['globalSearch', 'episodes', debouncedQuery, country] as const

  // Discovery Provider: Podcast Search (Debounced)
  const { data: podcasts = [], isFetching: isFetchingPodcasts } = useQuery({
    queryKey: podcastsQueryKey,
    queryFn: ({ signal }) => discovery.searchPodcasts(debouncedQuery, country, signal),
    enabled: shouldSearch,
    staleTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: shouldRetryDiscoveryRequest,
  })

  // Discovery Provider: Episode Search (Debounced)
  const { data: episodes = [], isFetching: isFetchingEpisodes } = useQuery({
    queryKey: episodesQueryKey,
    queryFn: ({ signal }) => discovery.searchEpisodes(debouncedQuery, country, signal),
    enabled: shouldSearch,
    staleTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: shouldRetryDiscoveryRequest,
  })

  const podcastSection = !hasActiveQuery
    ? buildSearchSection<SearchPodcast>(podcasts, false, false)
    : !isOnline
      ? buildUnavailableSearchSection<SearchPodcast>()
      : buildSearchSection<SearchPodcast>(podcasts, true, isFetchingPodcasts)
  const episodeSection = !hasActiveQuery
    ? buildSearchSection<SearchEpisode>(episodes, false, false)
    : !isOnline
      ? buildUnavailableSearchSection<SearchEpisode>()
      : buildSearchSection<SearchEpisode>(episodes, true, isFetchingEpisodes)

  return {
    podcastSection,
    episodeSection,
    isLoading: isSearchSectionLoading(podcastSection) || isSearchSectionLoading(episodeSection),
  }
}
