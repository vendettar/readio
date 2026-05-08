import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Podcast, PodcastEpisodes } from '@/lib/discovery'
import discovery from '@/lib/discovery'
import { getPodcastEpisodesBootstrapSnapshot } from '@/lib/discovery/episodeCache'
import {
  buildPodcastDetailQueryKey,
  buildPodcastEpisodesQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from '@/lib/discovery/podcastQueryContract'
import { readOrFetchPodcastEpisodes } from '@/lib/discovery/queryCache'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'

interface PodcastEpisodesAuthority {
  lastUpdateTime?: number
  episodeCount?: number
}

interface UsePodcastDetailAndEpisodesArgs {
  podcastItunesId: string
  routeCountry: string | undefined
  initialPodcast?: Podcast
}

export interface UsePodcastDetailAndEpisodesResult {
  normalizedRouteCountry: string | null
  podcast: Podcast | undefined
  isLoadingPodcast: boolean
  podcastError: Error | null
  episodeListAuthority: PodcastEpisodesAuthority
  episodesBootstrap:
    | {
        data: PodcastEpisodes
        updatedAt: number
        isAuthoritative: boolean
      }
    | undefined
  episodeList: PodcastEpisodes | undefined
  isLoadingEpisodes: boolean
  isFetchingEpisodes: boolean
  episodesError: Error | null
}

export function usePodcastDetailAndEpisodes({
  podcastItunesId,
  routeCountry,
  initialPodcast,
}: UsePodcastDetailAndEpisodesArgs): UsePodcastDetailAndEpisodesResult {
  const queryClient = useQueryClient()
  const normalizedRouteCountry = normalizeCountryParam(routeCountry)

  const {
    data: podcast,
    isLoading: isLoadingPodcast,
    error: podcastError,
  } = useQuery<Podcast | null>({
    queryKey: buildPodcastDetailQueryKey(podcastItunesId, normalizedRouteCountry ?? undefined),
    queryFn: ({ signal }) => discovery.getPodcastIndexPodcastByItunesId(podcastItunesId, signal),
    enabled: Boolean(normalizedRouteCountry && podcastItunesId),
    ...(initialPodcast ? { initialData: initialPodcast } : {}),
    ...(initialPodcast ? { initialDataUpdatedAt: 0 } : {}),
    staleTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.gcTime,
  })

  const episodeListAuthority = {
    lastUpdateTime: podcast?.lastUpdateTime,
    episodeCount: podcast?.episodeCount,
  }
  const episodesBootstrap = getPodcastEpisodesBootstrapSnapshot(
    queryClient,
    podcastItunesId,
    episodeListAuthority,
    normalizedRouteCountry ?? undefined
  )

  const {
    data: episodeList,
    isLoading: isLoadingEpisodes,
    isFetching: isFetchingEpisodes,
    error: episodesError,
  } = useQuery<PodcastEpisodes>({
    queryKey: buildPodcastEpisodesQueryKey(
      podcastItunesId,
      episodeListAuthority,
      normalizedRouteCountry ?? undefined
    ),
    initialData: episodesBootstrap?.data,
    initialDataUpdatedAt: episodesBootstrap?.updatedAt,
    queryFn: ({ signal }) =>
      readOrFetchPodcastEpisodes(
        queryClient,
        podcastItunesId,
        signal,
        episodeListAuthority,
        normalizedRouteCountry ?? undefined
      ),
    enabled: Boolean(normalizedRouteCountry && podcastItunesId && podcast),
    staleTime: PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.episodes.gcTime,
  })

  return {
    normalizedRouteCountry: normalizedRouteCountry ?? null,
    podcast: podcast ?? undefined,
    isLoadingPodcast,
    podcastError: (podcastError as Error | null) ?? null,
    episodeListAuthority,
    episodesBootstrap,
    episodeList,
    isLoadingEpisodes,
    isFetchingEpisodes,
    episodesError: (episodesError as Error | null) ?? null,
  }
}
