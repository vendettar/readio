import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Episode, Podcast } from '@/lib/discovery'
import {
  getCachedEditorPickByItunesID,
  getEditorPickRouteState,
  mapEditorPickToPodcast,
  matchesEditorPickRouteID,
  upsertEditorPickInCache,
} from '@/lib/discovery/editorPicks'
import { findEpisodeInPodcastEpisodesCache } from '@/lib/discovery/episodeCache'
import {
  buildPodcastEpisodeDetailQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
  PODCAST_QUERY_REFETCH_POLICY,
} from '@/lib/discovery/podcastQueryContract'
import { fetchPodcastEpisodeDetailOrNull } from '@/lib/discovery/queryCache'
import { compactKeyToEpisodeIdentity } from '@/lib/routes/compactKey'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'
import { findBootstrapEpisode, usePodcastDetail } from './usePodcastDetail'

export interface ResolvedEpisodeContent {
  podcast: Podcast
  episode: Episode
}

interface UseEpisodeResolutionResult {
  resolvedContent: ResolvedEpisodeContent | null
  isLoading: boolean
  resolutionError: Error | null
  notFound: 'podcast' | 'episode' | null
}

export function resolveEpisodeResolutionError({
  podcastError,
  episodesError,
}: {
  podcastError: Error | null
  episodesError: Error | null
}): Error | null {
  if (podcastError) return podcastError
  if (episodesError) return episodesError
  return null
}

/**
 * Hook to resolve an episode and its podcast metadata from URL params.
 * Country authority in content routes is route-param only.
 */
export function useEpisodeResolution(
  podcastId: string,
  rawEpisodeId: string,
  routeCountry: string | undefined,
  routeState?: unknown
): UseEpisodeResolutionResult {
  const queryClient = useQueryClient()
  const country = normalizeCountryParam(routeCountry)
  const normalizedPodcastId = podcastId.trim()
  const routeStateTyped = getEditorPickRouteState(routeState) ?? undefined
  const routeSnapshot = routeStateTyped?.editorPickSnapshot
  const editorPickSnapshot =
    routeSnapshot && matchesEditorPickRouteID(routeSnapshot, normalizedPodcastId)
      ? routeSnapshot
      : country
        ? getCachedEditorPickByItunesID(queryClient, country, normalizedPodcastId)
        : undefined
  const initialPodcast = editorPickSnapshot ? mapEditorPickToPodcast(editorPickSnapshot) : undefined
  const targetEpisodeGuid = compactKeyToEpisodeIdentity(rawEpisodeId) ?? ''

  useEffect(() => {
    if (country && editorPickSnapshot) {
      upsertEditorPickInCache(queryClient, country, editorPickSnapshot)
    }
  }, [country, editorPickSnapshot, queryClient])

  const { podcast, isLoadingPodcast, podcastError, episodesBootstrap } = usePodcastDetail({
    podcastItunesId: normalizedPodcastId,
    routeCountry,
    initialPodcast,
  })
  const cachedEpisode = findEpisodeInPodcastEpisodesCache(
    queryClient,
    normalizedPodcastId,
    targetEpisodeGuid,
    country
  )
  const bootstrapEpisode = findBootstrapEpisode(episodesBootstrap, targetEpisodeGuid)
  const shouldFetchEpisodeDetail = Boolean(
    country && podcast && targetEpisodeGuid && !cachedEpisode && !bootstrapEpisode
  )
  const {
    data: fetchedEpisode,
    isLoading: isLoadingEpisodeDetail,
    isFetching: isFetchingEpisodeDetail,
    error: episodeDetailError,
  } = useQuery<Episode | null>({
    queryKey: buildPodcastEpisodeDetailQueryKey(
      normalizedPodcastId,
      targetEpisodeGuid,
      country ?? undefined
    ),
    queryFn: ({ signal }) =>
      fetchPodcastEpisodeDetailOrNull(normalizedPodcastId, targetEpisodeGuid, signal),
    enabled: shouldFetchEpisodeDetail,
    staleTime: PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.episodes.gcTime,
    ...PODCAST_QUERY_REFETCH_POLICY,
  })

  const episode = cachedEpisode ?? bootstrapEpisode ?? fetchedEpisode ?? undefined

  const resolvedContent = podcast && episode ? { podcast, episode } : null

  const isLoading =
    !country ||
    isLoadingPodcast ||
    (Boolean(targetEpisodeGuid) &&
      !resolvedContent &&
      (isLoadingEpisodeDetail || isFetchingEpisodeDetail))
  const resolutionError = resolveEpisodeResolutionError({
    podcastError,
    episodesError: !episode ? ((episodeDetailError as Error | null) ?? null) : null,
  })
  const notFound =
    isLoading || resolutionError ? null : !podcast ? 'podcast' : !episode ? 'episode' : null

  return {
    resolvedContent,
    isLoading,
    resolutionError,
    notFound,
  }
}
