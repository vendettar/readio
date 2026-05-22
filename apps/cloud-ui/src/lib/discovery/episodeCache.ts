import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Episode, PodcastEpisodes } from './index'
import {
  buildPodcastEpisodesPagesQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from './podcastQueryContract'

interface PodcastEpisodesCacheReadOptions {
  allowStale?: boolean
  now?: number
}

export interface PodcastEpisodesBootstrapSnapshot {
  data: PodcastEpisodes
  updatedAt: number
}

export interface PodcastEpisodesCacheEntry {
  queryKey: ReturnType<typeof buildPodcastEpisodesPagesQueryKey>
  data: PodcastEpisodes
  updatedAt: number
  staleAt: number
}

export type PodcastEpisodesInfiniteData = InfiniteData<PodcastEpisodes, number>

function dedupeEpisodesByGuid(episodes: Episode[]): Episode[] {
  const seen = new Set<string>()
  const deduped: Episode[] = []
  for (const episode of episodes) {
    if (seen.has(episode.guid)) {
      continue
    }
    seen.add(episode.guid)
    deduped.push(episode)
  }
  return deduped
}

function isPodcastEpisodesCacheFresh(
  entry: Pick<PodcastEpisodesCacheEntry, 'staleAt'> | null | undefined,
  now = Date.now()
): boolean {
  return Boolean(entry && entry.staleAt > now)
}

function isQueryStateInvalidated(state: unknown): boolean {
  return Boolean(
    state && typeof state === 'object' && (state as { isInvalidated?: boolean }).isInvalidated
  )
}

function clonePodcastEpisodes(data: PodcastEpisodes): PodcastEpisodes {
  return {
    episodes: [...data.episodes],
    limit: data.limit,
    offset: data.offset,
    nextOffset: data.nextOffset,
    hasMore: data.hasMore,
    storedTotal: data.storedTotal,
    isTruncated: data.isTruncated,
    lastSuccessfulFetchAt: data.lastSuccessfulFetchAt,
    nextRefreshAfter: data.nextRefreshAfter,
  }
}

function isInfinitePodcastEpisodesData(data: unknown): data is PodcastEpisodesInfiniteData {
  return Boolean(
    data && typeof data === 'object' && Array.isArray((data as { pages?: unknown }).pages)
  )
}

function podcastEpisodesPagesFromQueryData(data: unknown): PodcastEpisodes[] {
  if (isInfinitePodcastEpisodesData(data)) {
    return data.pages
  }
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { episodes?: unknown }).episodes)
  ) {
    return [data as PodcastEpisodes]
  }
  return []
}

export function flattenPodcastEpisodePages(pages: PodcastEpisodes[]): PodcastEpisodes | undefined {
  const firstPage = pages[0]
  if (!firstPage) {
    return undefined
  }
  const lastPage = pages[pages.length - 1] ?? firstPage
  return {
    ...firstPage,
    episodes: dedupeEpisodesByGuid(pages.flatMap((page) => page.episodes)),
    nextOffset: lastPage.nextOffset,
    hasMore: lastPage.hasMore,
    storedTotal: lastPage.storedTotal,
    isTruncated: lastPage.isTruncated,
    lastSuccessfulFetchAt: lastPage.lastSuccessfulFetchAt,
    nextRefreshAfter: lastPage.nextRefreshAfter,
  }
}

export function getPodcastEpisodesCacheEntries(
  queryClient: QueryClient,
  podcastItunesId: string,
  country?: string
): PodcastEpisodesCacheEntry[] {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  if (!normalizedPodcastItunesId) {
    return []
  }

  if (typeof queryClient.getQueryCache !== 'function') {
    return []
  }

  // No country means "inspect every country-scoped cache entry for this podcast".
  // Exact reads below intentionally keep "no country" as the unscoped cache key.
  const prefix = buildPodcastEpisodesPagesQueryKey(normalizedPodcastItunesId, country)
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: prefix, exact: false })
    .flatMap((query) => {
      if (isQueryStateInvalidated(query.state)) {
        return []
      }
      const data = flattenPodcastEpisodePages(podcastEpisodesPagesFromQueryData(query.state.data))
      if (!data) {
        return []
      }

      const updatedAt = query.state.dataUpdatedAt
      return [
        {
          queryKey: query.queryKey as ReturnType<typeof buildPodcastEpisodesPagesQueryKey>,
          data: clonePodcastEpisodes(data),
          updatedAt,
          staleAt: updatedAt + PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
        } satisfies PodcastEpisodesCacheEntry,
      ]
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export function readPodcastEpisodesFromCache(
  queryClient: QueryClient,
  podcastItunesId: string,
  readOptions?: PodcastEpisodesCacheReadOptions & { country?: string }
): PodcastEpisodes | undefined {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  if (!normalizedPodcastItunesId) {
    return undefined
  }

  const queryKey = buildPodcastEpisodesPagesQueryKey(
    normalizedPodcastItunesId,
    readOptions?.country
  )
  const queryState = queryClient.getQueryState(queryKey)
  if (isQueryStateInvalidated(queryState)) {
    return undefined
  }
  const data = flattenPodcastEpisodePages(podcastEpisodesPagesFromQueryData(queryState?.data))
  const updatedAt = queryState?.dataUpdatedAt ?? 0
  if (!data) {
    return undefined
  }

  const entry = {
    queryKey,
    data,
    updatedAt,
    staleAt: updatedAt + PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
  } satisfies PodcastEpisodesCacheEntry

  if (!readOptions?.allowStale && !isPodcastEpisodesCacheFresh(entry, readOptions?.now)) {
    return undefined
  }

  return clonePodcastEpisodes(data)
}

export function getPodcastEpisodesBootstrapSnapshot(
  queryClient: QueryClient,
  podcastItunesId: string,
  country?: string
): PodcastEpisodesBootstrapSnapshot | undefined {
  const entries = getPodcastEpisodesCacheEntries(queryClient, podcastItunesId, country).filter(
    (entry) => isPodcastEpisodesCacheFresh(entry)
  )
  if (entries.length === 0) {
    return undefined
  }

  const entry = entries[0] satisfies PodcastEpisodesCacheEntry
  if (!entry) {
    return undefined
  }

  return {
    data: clonePodcastEpisodes(entry.data),
    updatedAt: entry.updatedAt,
  }
}

export function writePodcastEpisodesToCache(
  queryClient: QueryClient,
  podcastItunesId: string,
  payload: PodcastEpisodes,
  options?: {
    now?: number
    country?: string
  }
): PodcastEpisodes {
  const normalizedPodcastItunesId = podcastItunesId.trim()
  if (!normalizedPodcastItunesId) {
    throw new Error('podcast PI episode list cache key requires a non-empty podcastItunesId')
  }

  const now = options?.now ?? Date.now()
  const cachePayload: PodcastEpisodes = {
    episodes: dedupeEpisodesByGuid([...payload.episodes]),
    limit: payload.limit,
    offset: payload.offset,
    nextOffset: payload.nextOffset,
    hasMore: payload.hasMore,
    storedTotal: payload.storedTotal,
    isTruncated: payload.isTruncated,
    lastSuccessfulFetchAt: payload.lastSuccessfulFetchAt,
    nextRefreshAfter: payload.nextRefreshAfter,
  }
  const queryKey = buildPodcastEpisodesPagesQueryKey(normalizedPodcastItunesId, options?.country)

  queryClient.setQueryDefaults(queryKey, {
    gcTime: PODCAST_QUERY_CACHE_POLICY.episodes.gcTime,
  })

  queryClient.setQueryData(
    queryKey,
    {
      pages: [cachePayload],
      pageParams: [cachePayload.offset],
    } satisfies PodcastEpisodesInfiniteData,
    { updatedAt: now }
  )

  return cachePayload
}

export function findEpisodeInPodcastEpisodesCache(
  queryClient: QueryClient,
  podcastItunesId: string,
  episodeGuid: string,
  country?: string
): Episode | undefined {
  const normalizedEpisodeGuid = episodeGuid.trim()
  if (!normalizedEpisodeGuid) {
    return undefined
  }

  const exactEpisodeList = readPodcastEpisodesFromCache(queryClient, podcastItunesId, {
    country,
  })

  return exactEpisodeList?.episodes.find((episode) => episode.guid === normalizedEpisodeGuid)
}
