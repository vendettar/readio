import type { QueryClient } from '@tanstack/react-query'
import {
  type PodcastEpisodeListAuthority,
  readPodcastEpisodesFromCache,
  writePodcastEpisodesToCache,
} from './episodeCache'
import discovery, { type Podcast, type PodcastEpisodes } from './index'
import {
  buildPodcastDetailQueryKey,
  buildPodcastEpisodesQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from './podcastQueryContract'

export async function ensurePodcastDetail(
  queryClient: QueryClient,
  podcastItunesId: string,
  signal?: AbortSignal,
  country?: string
): Promise<Podcast | null> {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  if (!normalizedPodcastItunesId) {
    return null
  }

  return queryClient.fetchQuery({
    queryKey: buildPodcastDetailQueryKey(normalizedPodcastItunesId, country),
    queryFn: ({ signal: querySignal }) =>
      discovery.getPodcastIndexPodcastByItunesId(normalizedPodcastItunesId, signal ?? querySignal),
    staleTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.gcTime,
  })
}

export async function fetchAndCachePodcastEpisodes(
  queryClient: QueryClient,
  podcastItunesId: string,
  signal?: AbortSignal,
  authority?: PodcastEpisodeListAuthority,
  country?: string
): Promise<PodcastEpisodes> {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  const fetchedEpisodes = await discovery.fetchPodcastEpisodes(normalizedPodcastItunesId, signal)
  return writePodcastEpisodesToCache(queryClient, normalizedPodcastItunesId, fetchedEpisodes, {
    authority,
    country,
  })
}

export async function readOrFetchPodcastEpisodes(
  queryClient: QueryClient,
  podcastItunesId: string,
  signal?: AbortSignal,
  authority?: PodcastEpisodeListAuthority,
  country?: string
): Promise<PodcastEpisodes> {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  const cachedEpisodes = readPodcastEpisodesFromCache(queryClient, normalizedPodcastItunesId, {
    authority,
    country,
  })
  if (cachedEpisodes) {
    return cachedEpisodes
  }

  return fetchAndCachePodcastEpisodes(
    queryClient,
    normalizedPodcastItunesId,
    signal,
    authority,
    country
  )
}

export async function ensurePodcastEpisodes(
  queryClient: QueryClient,
  podcastItunesId: string,
  options?: {
    signal?: AbortSignal
    authority?: PodcastEpisodeListAuthority
    country?: string
  }
): Promise<PodcastEpisodes> {
  const normalizedPodcastItunesId = podcastItunesId.trim()

  return queryClient.fetchQuery({
    queryKey: buildPodcastEpisodesQueryKey(
      normalizedPodcastItunesId,
      options?.authority,
      options?.country
    ),
    queryFn: ({ signal: querySignal }) =>
      readOrFetchPodcastEpisodes(
        queryClient,
        normalizedPodcastItunesId,
        options?.signal ?? querySignal,
        options?.authority,
        options?.country
      ),
    staleTime: PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.episodes.gcTime,
  })
}
