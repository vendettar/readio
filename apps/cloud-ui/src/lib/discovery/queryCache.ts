import type { QueryClient } from '@tanstack/react-query'
import { FetchError } from '../fetchUtils'
import {
  flattenPodcastEpisodePages,
  readPodcastEpisodesFromCache,
  writePodcastEpisodesToCache,
} from './episodeCache'
import discovery, { type Podcast, type PodcastEpisodes } from './index'
import {
  buildPodcastDetailQueryKey,
  buildPodcastEpisodeDetailQueryKey,
  buildPodcastEpisodesPagesQueryKey,
  PODCAST_EPISODES_PAGE_SIZE,
  PODCAST_QUERY_CACHE_POLICY,
} from './podcastQueryContract'
import type { Episode } from './schema'

export async function fetchPodcastEpisodeDetailOrNull(
  podcastItunesId: string,
  episodeGuid: string,
  signal?: AbortSignal
): Promise<Episode | null> {
  try {
    return await discovery.fetchPodcastEpisodeDetail(podcastItunesId, episodeGuid, signal)
  } catch (error) {
    if (error instanceof FetchError && error.status === 404 && error.code === 'EPISODE_NOT_FOUND') {
      return null
    }
    throw error
  }
}

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
  country?: string
): Promise<PodcastEpisodes> {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  const fetchedEpisodes = await discovery.fetchPodcastEpisodes(normalizedPodcastItunesId, {
    signal,
    limit: PODCAST_EPISODES_PAGE_SIZE,
    offset: 0,
  })
  return writePodcastEpisodesToCache(queryClient, normalizedPodcastItunesId, fetchedEpisodes, {
    country,
  })
}

export async function ensurePodcastEpisodeDetail(
  queryClient: QueryClient,
  podcastItunesId: string,
  episodeGuid: string,
  options?: {
    signal?: AbortSignal
    country?: string
  }
): Promise<Episode | null> {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  const normalizedEpisodeGuid = episodeGuid.trim()
  if (!normalizedPodcastItunesId || !normalizedEpisodeGuid) {
    return null
  }

  return queryClient.fetchQuery({
    queryKey: buildPodcastEpisodeDetailQueryKey(
      normalizedPodcastItunesId,
      normalizedEpisodeGuid,
      options?.country
    ),
    queryFn: ({ signal: querySignal }) =>
      fetchPodcastEpisodeDetailOrNull(
        normalizedPodcastItunesId,
        normalizedEpisodeGuid,
        options?.signal ?? querySignal
      ),
    staleTime: PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.episodes.gcTime,
  })
}

export async function readOrFetchPodcastEpisodes(
  queryClient: QueryClient,
  podcastItunesId: string,
  signal?: AbortSignal,
  country?: string
): Promise<PodcastEpisodes> {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  const cachedEpisodes = readPodcastEpisodesFromCache(queryClient, normalizedPodcastItunesId, {
    country,
  })
  if (cachedEpisodes) {
    return cachedEpisodes
  }

  return fetchAndCachePodcastEpisodes(queryClient, normalizedPodcastItunesId, signal, country)
}

export async function ensurePodcastEpisodes(
  queryClient: QueryClient,
  podcastItunesId: string,
  options?: {
    signal?: AbortSignal
    country?: string
  }
): Promise<PodcastEpisodes> {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  if (!normalizedPodcastItunesId) {
    return {
      episodes: [],
      limit: PODCAST_EPISODES_PAGE_SIZE,
      offset: 0,
      nextOffset: 0,
      hasMore: false,
      storedTotal: 0,
      isTruncated: false,
    }
  }

  const cachedEpisodes = readPodcastEpisodesFromCache(queryClient, normalizedPodcastItunesId, {
    country: options?.country,
  })
  if (cachedEpisodes) {
    return cachedEpisodes
  }

  const queryKey = buildPodcastEpisodesPagesQueryKey(normalizedPodcastItunesId, options?.country)
  const infiniteData = await queryClient.fetchInfiniteQuery({
    queryKey,
    queryFn: ({ signal: querySignal, pageParam = 0 }) =>
      discovery.fetchPodcastEpisodes(normalizedPodcastItunesId, {
        signal: options?.signal ?? querySignal,
        limit: PODCAST_EPISODES_PAGE_SIZE,
        offset: Number(pageParam),
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: PodcastEpisodes) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,
    staleTime: PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.episodes.gcTime,
  })

  const episodes = flattenPodcastEpisodePages(infiniteData.pages) ?? {
    episodes: [],
    limit: PODCAST_EPISODES_PAGE_SIZE,
    offset: 0,
    nextOffset: 0,
    hasMore: false,
    storedTotal: 0,
    isTruncated: false,
  }

  return writePodcastEpisodesToCache(queryClient, normalizedPodcastItunesId, episodes, {
    country: options?.country,
  })
}
