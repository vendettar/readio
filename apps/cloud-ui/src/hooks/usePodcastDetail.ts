import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Podcast, PodcastEpisodes } from '@/lib/discovery'
import discovery from '@/lib/discovery'
import {
  getPodcastEpisodesBootstrapSnapshot,
  type PodcastEpisodesBootstrapSnapshot,
} from '@/lib/discovery/episodeCache'
import {
  buildPodcastDetailQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
  PODCAST_QUERY_REFETCH_POLICY,
} from '@/lib/discovery/podcastQueryContract'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'

interface UsePodcastDetailArgs {
  podcastItunesId: string
  routeCountry: string | undefined
  initialPodcast?: Podcast
}

export interface UsePodcastDetailResult {
  normalizedRouteCountry: string | null
  podcast: Podcast | undefined
  isLoadingPodcast: boolean
  isFetchingPodcast: boolean
  podcastError: Error | null
  episodesBootstrap: PodcastEpisodesBootstrapSnapshot | undefined
}

export function findBootstrapEpisode(
  episodesBootstrap: PodcastEpisodesBootstrapSnapshot | undefined,
  targetEpisodeGuid: string
): PodcastEpisodes['episodes'][number] | undefined {
  if (!episodesBootstrap) {
    return undefined
  }

  return episodesBootstrap.data.episodes.find((candidate) => candidate.guid === targetEpisodeGuid)
}

export function usePodcastDetail({
  podcastItunesId,
  routeCountry,
  initialPodcast,
}: UsePodcastDetailArgs): UsePodcastDetailResult {
  const queryClient = useQueryClient()
  const normalizedRouteCountry = normalizeCountryParam(routeCountry)
  const normalizedPodcastItunesId = podcastItunesId.trim()

  const {
    data: podcast,
    isLoading: isLoadingPodcast,
    isFetching: isFetchingPodcast,
    error: podcastError,
  } = useQuery<Podcast | null>({
    queryKey: buildPodcastDetailQueryKey(
      normalizedPodcastItunesId,
      normalizedRouteCountry ?? undefined
    ),
    queryFn: ({ signal }) =>
      discovery.getPodcastIndexPodcastByItunesId(normalizedPodcastItunesId, signal),
    enabled: Boolean(normalizedRouteCountry && normalizedPodcastItunesId),
    ...(initialPodcast ? { initialData: initialPodcast } : {}),
    ...(initialPodcast ? { initialDataUpdatedAt: 0 } : {}),
    staleTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.gcTime,
    ...PODCAST_QUERY_REFETCH_POLICY,
  })

  const episodesBootstrap = getPodcastEpisodesBootstrapSnapshot(
    queryClient,
    normalizedPodcastItunesId,
    normalizedRouteCountry ?? undefined
  )

  return {
    normalizedRouteCountry: normalizedRouteCountry ?? null,
    podcast: podcast ?? undefined,
    isLoadingPodcast,
    isFetchingPodcast,
    podcastError: (podcastError as Error | null) ?? null,
    episodesBootstrap,
  }
}
