import { useMemo } from 'react'
import type { SearchEpisode, SearchPodcast } from '../lib/discovery'
import { useDiscoverySearch } from './useDiscoverySearch'
import {
  buildSearchSection,
  type GlobalSearchOverallState,
  hasActiveSearchQuery,
  resolveGlobalSearchPresentation,
  type SearchSection,
} from './searchSection'
import {
  type GlobalSearchLimits,
  type LocalSearchBadge,
  type LocalSearchResult,
  useLocalSearch,
} from './useLocalSearch'

export type { LocalSearchBadge, LocalSearchResult, GlobalSearchLimits }

export interface GlobalSearchResults {
  podcastSection: SearchSection<SearchPodcast>
  episodeSection: SearchSection<SearchEpisode>
  localSection: SearchSection<LocalSearchResult>
  totalResultsCount: number
  overallState: GlobalSearchOverallState
  isLoading: boolean
  isEmpty: boolean
}

// ========== Hook ==========

export function useGlobalSearch(
  query: string,
  enabled = true,
  limits?: Partial<GlobalSearchLimits>
): GlobalSearchResults {
  const { podcastSection, episodeSection } = useDiscoverySearch(query, enabled)
  const { localResults, isLoading: isLoadingLocal } = useLocalSearch(query, enabled, limits)
  const hasActiveQuery = enabled && hasActiveSearchQuery(query)
  const localSection: SearchSection<LocalSearchResult> = buildSearchSection(
    localResults,
    hasActiveQuery,
    isLoadingLocal
  )
  const presentation = resolveGlobalSearchPresentation({
    query,
    enabled,
    podcastSection,
    episodeSection,
    localSection,
  })

  return useMemo(
    () => ({
      podcastSection,
      episodeSection,
      localSection,
      totalResultsCount: presentation.totalResultsCount,
      overallState: presentation.overallState,
      isLoading: presentation.isLoading,
      isEmpty: presentation.isEmpty,
    }),
    [podcastSection, episodeSection, localSection, presentation]
  )
}
