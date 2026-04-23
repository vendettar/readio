import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { FeedEpisode, ParsedFeed, Podcast } from '@/lib/discovery'
import discovery from '@/lib/discovery'
import {
  getCachedEditorPickByItunesID,
  getEditorPickRouteState,
  getEpisodeGuid,
  mapEditorPickToPodcast,
  matchesEditorPickRouteID,
  upsertEditorPickInCache,
} from '@/lib/discovery/editorPicks'
import {
  buildPodcastFeedQueryKey,
  buildPodcastDetailQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from '@/lib/discovery/podcastQueryContract'
import { compactKeyToEpisodeIdentity } from '@/lib/routes/compactKey'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'

interface UseEpisodeResolutionResult {
  podcast: Podcast | undefined | null
  episode: FeedEpisode | undefined
  isLoading: boolean
  podcastError: Error | null
  resolutionError: Error | null
}

export function resolveEpisodeResolutionError({
  podcastError,
  feedError,
}: {
  podcastError: Error | null
  feedError: Error | null
}): Error | null {
  if (podcastError) return podcastError
  if (feedError) return feedError
  return null
}

function matchesEpisodeGuid(
  episode: Pick<FeedEpisode, 'episodeGuid'> | null | undefined,
  targetGuid: string
): boolean {
  if (!episode || !targetGuid) return false
  return getEpisodeGuid(episode) === targetGuid
}

function findEpisodeByGuid(
  episodes: FeedEpisode[] | null | undefined,
  targetGuid: string
): FeedEpisode | undefined {
  if (!episodes || !targetGuid) return undefined
  return episodes.find((episode) => matchesEpisodeGuid(episode, targetGuid))
}

/**
 * Hook to resolve an episode and its podcast metadata from URL params.
 * Country authority in content routes is route-param only.
 */
export function useEpisodeResolution(
  podcastId: string,
  rawEpisodeId: string,
  routeCountry: string,
  routeState?: unknown
): UseEpisodeResolutionResult {
  const queryClient = useQueryClient()
  const country = normalizeCountryParam(routeCountry)
  const normalizedPodcastId = podcastId.trim()
  const routeSnapshot = getEditorPickRouteState(routeState)?.editorPickSnapshot
  const editorPickSnapshot =
    routeSnapshot && matchesEditorPickRouteID(routeSnapshot, normalizedPodcastId)
      ? routeSnapshot
      : getCachedEditorPickByItunesID(queryClient, country, normalizedPodcastId)
  const initialPodcast = editorPickSnapshot ? mapEditorPickToPodcast(editorPickSnapshot) : undefined
  const targetEpisodeGuid = compactKeyToEpisodeIdentity(rawEpisodeId) ?? ''
  const podcastQueryKey = buildPodcastDetailQueryKey(normalizedPodcastId, country)

  useEffect(() => {
    if (editorPickSnapshot) {
      upsertEditorPickInCache(queryClient, country, editorPickSnapshot)
    }
  }, [country, editorPickSnapshot, queryClient])

  const {
    data: podcast,
    isLoading: isLoadingPodcast,
    error: podcastError,
  } = useQuery<Podcast | null>({
    queryKey: podcastQueryKey,
    queryFn: ({ signal }) =>
      discovery.getPodcastIndexPodcastByItunesId(normalizedPodcastId, signal),
    enabled: Boolean(country && normalizedPodcastId),
    ...(initialPodcast ? { initialData: initialPodcast } : {}),
    staleTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.gcTime,
  })

  const feedUrl = podcast?.feedUrl
  const cachedFeed = feedUrl
    ? (queryClient.getQueryData(buildPodcastFeedQueryKey(feedUrl)) as
        | ParsedFeed
        | undefined)
    : undefined
  const cachedEpisode = findEpisodeByGuid(
    cachedFeed?.episodes as FeedEpisode[] | undefined,
    targetEpisodeGuid
  )
  const shouldFetchRssFallback = Boolean(
    feedUrl && targetEpisodeGuid && !cachedEpisode
  )
  const {
    data: fallbackFeed,
    isLoading: isLoadingFeedFallback,
    error: feedError,
  } = useQuery<ParsedFeed>({
    queryKey: buildPodcastFeedQueryKey(feedUrl),
    queryFn: ({ signal }) => discovery.fetchPodcastFeed(feedUrl ?? '', signal),
    enabled: shouldFetchRssFallback,
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })

  const rssFallbackEpisode = findEpisodeByGuid(fallbackFeed?.episodes, targetEpisodeGuid)
  const episode = cachedEpisode ?? rssFallbackEpisode

  const isLoading = !country || isLoadingPodcast || (!episode && isLoadingFeedFallback)
  const resolutionError = resolveEpisodeResolutionError({
    podcastError: podcastError as Error | null,
    feedError: !episode ? (feedError as Error | null) : null,
  })

  return {
    podcast,
    episode,
    isLoading,
    podcastError: podcastError as Error | null,
    resolutionError,
  }
}
