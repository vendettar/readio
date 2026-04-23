import { useMemo } from 'react'
import type { SearchEpisode, SearchPodcast } from '../lib/discovery'
import { useDiscoverySearch } from './useDiscoverySearch'
import {
  type GlobalSearchLimits,
  type LocalSearchBadge,
  type LocalSearchResult,
  useLocalSearch,
} from './useLocalSearch'

export type { LocalSearchBadge, LocalSearchResult, GlobalSearchLimits }

export interface GlobalSearchResults {
  podcasts: SearchPodcast[]
  episodes: SearchEpisode[]
  local: LocalSearchResult[]
  isLoading: boolean
  isEmpty: boolean
}

// ========== Hook ==========

export function useGlobalSearch(
  query: string,
  enabled = true,
  limits?: Partial<GlobalSearchLimits>
): GlobalSearchResults {
  const { podcasts, episodes, isLoading: isLoadingDiscovery } = useDiscoverySearch(query, enabled)
  const { localResults, isLoading: isLoadingLocal } = useLocalSearch(query, enabled, limits)

  const isLoading = isLoadingDiscovery || isLoadingLocal
  const isEmpty =
    !isLoading && podcasts.length === 0 && episodes.length === 0 && localResults.length === 0

  return useMemo(
    () => ({
      podcasts,
      episodes,
      local: localResults,
      isLoading,
      isEmpty,
    }),
    [podcasts, episodes, localResults, isLoading, isEmpty]
  )
}
