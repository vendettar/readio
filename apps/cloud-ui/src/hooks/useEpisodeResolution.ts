import { useQueryClient } from '@tanstack/react-query'
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
import { compactKeyToEpisodeIdentity } from '@/lib/routes/compactKey'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'
import { usePodcastDetailAndEpisodes } from './usePodcastDetailAndEpisodes'

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

  const {
    podcast,
    isLoadingPodcast,
    podcastError,
    episodeListAuthority,
    episodesBootstrap,
    episodeList,
    isLoadingEpisodes,
    isFetchingEpisodes,
    episodesError,
  } = usePodcastDetailAndEpisodes({
    podcastItunesId: normalizedPodcastId,
    routeCountry,
    initialPodcast,
  })
  const cachedEpisode = findEpisodeInPodcastEpisodesCache(
    queryClient,
    normalizedPodcastId,
    targetEpisodeGuid,
    episodeListAuthority,
    country
  )
  const canTrustBootstrapEpisodeResolution = !episodesBootstrap || episodesBootstrap.isAuthoritative

  const episode =
    cachedEpisode ??
    (canTrustBootstrapEpisodeResolution
      ? episodeList?.episodes.find((candidate) => candidate.guid === targetEpisodeGuid)
      : undefined)

  const resolvedContent = podcast && episode ? { podcast, episode } : null

  const isLoading =
    !country ||
    isLoadingPodcast ||
    (Boolean(targetEpisodeGuid) && !resolvedContent && (isLoadingEpisodes || isFetchingEpisodes))
  const resolutionError = resolveEpisodeResolutionError({
    podcastError,
    episodesError: !episode ? episodesError : null,
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
