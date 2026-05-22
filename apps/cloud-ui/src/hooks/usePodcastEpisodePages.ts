import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Episode, Podcast } from '@/lib/discovery'
import discovery from '@/lib/discovery'
import {
  buildPodcastEpisodesPagesQueryKey,
  PODCAST_EPISODES_PAGE_SIZE,
  PODCAST_QUERY_CACHE_POLICY,
  PODCAST_QUERY_REFETCH_POLICY,
} from '@/lib/discovery/podcastQueryContract'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'

interface UsePodcastEpisodePagesArgs {
  podcastItunesId: string
  routeCountry: string | undefined
  podcast: Podcast | null | undefined
}

interface UsePodcastEpisodePagesResult {
  episodes: Episode[]
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

export function usePodcastEpisodePages({
  podcastItunesId,
  routeCountry,
  podcast,
}: UsePodcastEpisodePagesArgs): UsePodcastEpisodePagesResult {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  const normalizedRouteCountry = normalizeCountryParam(routeCountry) ?? undefined

  const {
    data: episodePages,
    isLoading,
    isFetching,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: buildPodcastEpisodesPagesQueryKey(normalizedPodcastItunesId, normalizedRouteCountry),
    queryFn: ({ signal, pageParam }) =>
      discovery.fetchPodcastEpisodes(normalizedPodcastItunesId, {
        signal,
        limit: PODCAST_EPISODES_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: Boolean(normalizedPodcastItunesId && podcast),
    staleTime: PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.episodes.gcTime,
    ...PODCAST_QUERY_REFETCH_POLICY,
  })

  const episodes = useMemo(
    () => episodePages?.pages.flatMap((page) => page.episodes) ?? [],
    [episodePages?.pages]
  )

  return {
    episodes,
    isLoading,
    isFetching,
    error: (error as Error | null) ?? null,
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage: () => {
      if (hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
    },
  }
}
