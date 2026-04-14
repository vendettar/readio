import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Episode, ParsedFeed, Podcast } from '@/lib/discovery'
import discovery from '@/lib/discovery'
import {
  getCachedEditorPickByItunesID,
  getEditorPickRouteState,
  getStableEpisodeIdentifier,
  mapEditorPickToPodcast,
  matchesEditorPickRouteID,
  upsertEditorPickInCache,
} from '@/lib/discovery/editorPicks'
import {
  buildPodcastFeedQueryKey,
  buildPodcastIndexEpisodesQueryKey,
  buildPodcastIndexLookupQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from '@/lib/discovery/podcastQueryContract'
import { compactKeyToUUID } from '@/lib/routes/compactKey'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'

interface UseEpisodeResolutionResult {
  podcast: Podcast | undefined | null
  episode: Episode | undefined
  isLoading: boolean
  podcastError: Error | null
  resolutionError: Error | null
}

const RECENT_EPISODES_LIMIT = 60

export function resolveEpisodeResolutionError({
  podcastError,
  feedError,
  supplementalEpisodesError,
}: {
  podcastError: Error | null
  feedError: Error | null
  supplementalEpisodesError: Error | null
}): Error | null {
  if (podcastError) return podcastError
  if (supplementalEpisodesError) return supplementalEpisodesError
  if (feedError) return feedError
  return null
}

function matchesEpisodeGuid(
  episode: Pick<Episode, 'id' | 'episodeGuid'> | null | undefined,
  targetGuid: string
): boolean {
  if (!episode || !targetGuid) return false
  const stableIdentifier = getStableEpisodeIdentifier(episode)
  return stableIdentifier === targetGuid
}

function findEpisodeByGuid(
  episodes: Episode[] | null | undefined,
  targetGuid: string
): Episode | undefined {
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
  const targetEpisodeGuid = compactKeyToUUID(rawEpisodeId) ?? ''
  const podcastQueryKey = buildPodcastIndexLookupQueryKey(normalizedPodcastId, country)
  const podcastIndexEpisodesQueryKey = buildPodcastIndexEpisodesQueryKey(
    normalizedPodcastId,
    country
  )

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
    staleTime: PODCAST_QUERY_CACHE_POLICY.lookup.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.lookup.gcTime,
  })

  const feedUrl = podcast?.feedUrl
  const cachedFeed = feedUrl
    ? queryClient.getQueryData<ParsedFeed>(buildPodcastFeedQueryKey(feedUrl))
    : undefined
  const cachedEpisode = findEpisodeByGuid(cachedFeed?.episodes, targetEpisodeGuid)
  const canResolveEpisodeFromGuid = Boolean(country && normalizedPodcastId && targetEpisodeGuid)

  const shouldLookupRecentEpisodes = canResolveEpisodeFromGuid && !cachedEpisode
  const {
    data: recentEpisodes,
    isLoading: isLoadingRecentEpisodes,
    error: recentEpisodesError,
  } = useQuery<Episode[]>({
    queryKey: [...podcastIndexEpisodesQueryKey, 'recent', RECENT_EPISODES_LIMIT],
    queryFn: ({ signal }) =>
      discovery.getPodcastIndexEpisodes(
        normalizedPodcastId,
        RECENT_EPISODES_LIMIT,
        signal
      ),
    enabled: shouldLookupRecentEpisodes,
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })

  const recentEpisode = findEpisodeByGuid(recentEpisodes, targetEpisodeGuid)
  const shouldLookupExactEpisode =
    canResolveEpisodeFromGuid && !cachedEpisode && !recentEpisode && !isLoadingRecentEpisodes
  const {
    data: exactEpisode,
    isLoading: isLoadingExactEpisode,
    error: exactEpisodeError,
  } = useQuery<Episode | null>({
    queryKey: [...podcastIndexEpisodesQueryKey, 'guid', targetEpisodeGuid],
    queryFn: ({ signal }) =>
      discovery.getPodcastIndexEpisodeByGuid(
        targetEpisodeGuid,
        normalizedPodcastId,
        signal
      ),
    enabled: shouldLookupExactEpisode,
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })

  const shouldFetchFeedFallback = Boolean(
    feedUrl &&
      targetEpisodeGuid &&
      !cachedEpisode &&
      !recentEpisode &&
      !exactEpisode &&
      !isLoadingRecentEpisodes &&
      !isLoadingExactEpisode
  )
  const {
    data: fallbackFeed,
    isLoading: isLoadingFeedFallback,
    error: feedError,
  } = useQuery<ParsedFeed>({
    queryKey: buildPodcastFeedQueryKey(feedUrl),
    queryFn: ({ signal }) => discovery.fetchPodcastFeed(feedUrl ?? '', signal),
    enabled: shouldFetchFeedFallback,
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })

  const rssFallbackEpisode = findEpisodeByGuid(fallbackFeed?.episodes, targetEpisodeGuid)
  const episode = cachedEpisode ?? recentEpisode ?? exactEpisode ?? rssFallbackEpisode

  const episodeLookupError =
    !episode && ((recentEpisodesError as Error | null) ?? (exactEpisodeError as Error | null))
  const isLoading =
    !country ||
    isLoadingPodcast ||
    (!episode && (isLoadingRecentEpisodes || isLoadingExactEpisode || isLoadingFeedFallback))
  const resolutionError = resolveEpisodeResolutionError({
    podcastError: podcastError as Error | null,
    feedError: !episode ? (feedError as Error | null) : null,
    supplementalEpisodesError: episodeLookupError || null,
  })

  return {
    podcast,
    episode,
    isLoading,
    podcastError: podcastError as Error | null,
    resolutionError,
  }
}
