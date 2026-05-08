export type SearchSectionStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export type GlobalSearchOverallState =
  | 'idle'
  | 'loading'
  | 'refreshing'
  | 'results'
  | 'empty'
  | 'unavailable'

export interface SearchSection<T> {
  items: T[]
  status: SearchSectionStatus
}

export function normalizeSearchQuery(query: string): string {
  return query.toLowerCase().trim()
}

export function trimSearchQuery(query: string): string {
  return query.trim()
}

export function hasSearchText(query: string): boolean {
  return trimSearchQuery(query).length > 0
}

export function hasActiveSearchQuery(query: string): boolean {
  return trimSearchQuery(query).length >= 2
}

export function buildSearchSection<T>(
  items: T[],
  shouldResolve: boolean,
  isLoading: boolean
): SearchSection<T> {
  if (!shouldResolve) {
    return {
      items: [],
      status: 'idle',
    }
  }

  return {
    items,
    status: isLoading ? 'loading' : 'ready',
  }
}

export function buildUnavailableSearchSection<T>(): SearchSection<T> {
  return {
    items: [],
    status: 'unavailable',
  }
}

export function isSearchSectionLoading<T>(section: SearchSection<T>): boolean {
  return section.status === 'loading'
}

export function isSearchSectionUnavailable<T>(section: SearchSection<T>): boolean {
  return section.status === 'unavailable'
}

export function hasSearchSectionItems<T>(section: SearchSection<T>): boolean {
  return section.items.length > 0
}

export function getSearchSectionsItemCount(
  ...sections: Array<SearchSection<unknown>>
): number {
  return sections.reduce((count, section) => count + section.items.length, 0)
}

export function deriveGlobalSearchOverallState(args: {
  query: string
  enabled: boolean
  podcastSection: SearchSection<unknown>
  episodeSection: SearchSection<unknown>
  localSection: SearchSection<unknown>
}): GlobalSearchOverallState {
  const { query, enabled, podcastSection, episodeSection, localSection } = args
  const hasQueryText = hasSearchText(query)
  const hasActiveQuery = enabled && hasActiveSearchQuery(query)
  const totalResultsCount = getSearchSectionsItemCount(
    podcastSection,
    episodeSection,
    localSection
  )
  const isLoading =
    isSearchSectionLoading(podcastSection) ||
    isSearchSectionLoading(episodeSection) ||
    isSearchSectionLoading(localSection)
  const discoveryUnavailable =
    isSearchSectionUnavailable(podcastSection) && isSearchSectionUnavailable(episodeSection)

  if (!enabled || !hasQueryText) {
    return 'idle'
  }

  if (totalResultsCount > 0) {
    return isLoading ? 'refreshing' : 'results'
  }

  if (!hasActiveQuery) {
    return 'idle'
  }

  if (isLoading) {
    return 'loading'
  }

  if (discoveryUnavailable) {
    return 'unavailable'
  }

  return 'empty'
}

export function resolveGlobalSearchPresentation(args: {
  query: string
  enabled: boolean
  podcastSection: SearchSection<unknown>
  episodeSection: SearchSection<unknown>
  localSection: SearchSection<unknown>
  totalResultsCount?: number
  overallState?: GlobalSearchOverallState
}): {
  totalResultsCount: number
  overallState: GlobalSearchOverallState
  isLoading: boolean
  isEmpty: boolean
  hasVisibleResults: boolean
} {
  const totalResultsCount =
    args.totalResultsCount ??
    getSearchSectionsItemCount(args.podcastSection, args.episodeSection, args.localSection)
  const overallState =
    args.overallState ??
    deriveGlobalSearchOverallState({
      query: args.query,
      enabled: args.enabled,
      podcastSection: args.podcastSection,
      episodeSection: args.episodeSection,
      localSection: args.localSection,
    })

  return {
    totalResultsCount,
    overallState,
    isLoading: overallState === 'loading' || overallState === 'refreshing',
    isEmpty: overallState === 'empty',
    hasVisibleResults: overallState === 'results' || overallState === 'refreshing',
  }
}
