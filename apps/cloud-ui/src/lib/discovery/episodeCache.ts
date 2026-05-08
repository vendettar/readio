import type { QueryClient } from '@tanstack/react-query'
import type { Episode, PodcastEpisodes } from './index'
import {
  buildPodcastEpisodesQueryKey,
  buildPodcastEpisodesQueryPrefix,
  PODCAST_QUERY_CACHE_POLICY,
} from './podcastQueryContract'

export interface PodcastEpisodeListAuthority {
  lastUpdateTime?: number
  episodeCount?: number
}

interface PodcastEpisodesCacheReadOptions {
  allowStale?: boolean
  now?: number
  authority?: PodcastEpisodeListAuthority
}

export interface PodcastEpisodesBootstrapSnapshot {
  data: PodcastEpisodes
  updatedAt: number
  isAuthoritative: boolean
}

export interface PodcastEpisodesCacheEntry {
  queryKey: ReturnType<typeof buildPodcastEpisodesQueryKey>
  data: PodcastEpisodes
  updatedAt: number
  staleAt: number
  authority?: PodcastEpisodeListAuthority
}

function normalizeAuthority(
  authority?: PodcastEpisodeListAuthority
): PodcastEpisodeListAuthority | undefined {
  if (!authority) {
    return undefined
  }

  const normalized: PodcastEpisodeListAuthority = {}
  if (typeof authority.lastUpdateTime === 'number' && Number.isFinite(authority.lastUpdateTime)) {
    normalized.lastUpdateTime = authority.lastUpdateTime
  }
  if (typeof authority.episodeCount === 'number' && Number.isFinite(authority.episodeCount)) {
    normalized.episodeCount = authority.episodeCount
  }

  return normalized.lastUpdateTime !== undefined || normalized.episodeCount !== undefined
    ? normalized
    : undefined
}

function matchesPodcastEpisodeListAuthority(
  candidateAuthority: PodcastEpisodeListAuthority | undefined,
  requestedAuthority?: PodcastEpisodeListAuthority
): boolean {
  const normalizedRequestedAuthority = normalizeAuthority(requestedAuthority)
  if (!normalizedRequestedAuthority) {
    return true
  }

  if (
    normalizedRequestedAuthority.lastUpdateTime !== undefined &&
    candidateAuthority?.lastUpdateTime !== normalizedRequestedAuthority.lastUpdateTime
  ) {
    return false
  }

  if (
    normalizedRequestedAuthority.episodeCount !== undefined &&
    candidateAuthority?.episodeCount !== normalizedRequestedAuthority.episodeCount
  ) {
    return false
  }

  return true
}

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

function parseAuthorityNumberToken(token: unknown, prefix: 'lut-' | 'count-'): number | undefined {
  if (typeof token !== 'string' || !token.startsWith(prefix)) {
    return undefined
  }

  const rawValue = token.slice(prefix.length)
  if (rawValue === 'na') {
    return undefined
  }

  const parsed = Number(rawValue)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parsePodcastEpisodesAuthorityFromQueryKey(
  queryKey: readonly unknown[]
): PodcastEpisodeListAuthority | undefined {
  const lastUpdateToken = queryKey[queryKey.length - 2]
  const episodeCountToken = queryKey[queryKey.length - 1]
  const authority = normalizeAuthority({
    lastUpdateTime: parseAuthorityNumberToken(lastUpdateToken, 'lut-'),
    episodeCount: parseAuthorityNumberToken(episodeCountToken, 'count-'),
  })

  return authority
}

function isPodcastEpisodesCacheFresh(
  entry: Pick<PodcastEpisodesCacheEntry, 'staleAt'> | null | undefined,
  now = Date.now()
): boolean {
  return Boolean(entry && entry.staleAt > now)
}

function clonePodcastEpisodes(data: PodcastEpisodes): PodcastEpisodes {
  return {
    episodes: [...data.episodes],
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

  const prefix = buildPodcastEpisodesQueryPrefix(normalizedPodcastItunesId, country)
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: prefix, exact: false })
    .flatMap((query) => {
      const data = query.state.data as PodcastEpisodes | undefined
      if (!data) {
        return []
      }

      const updatedAt = query.state.dataUpdatedAt
      return [
        {
          queryKey: query.queryKey as ReturnType<typeof buildPodcastEpisodesQueryKey>,
          data: clonePodcastEpisodes(data),
          updatedAt,
          staleAt: updatedAt + PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
          authority: parsePodcastEpisodesAuthorityFromQueryKey(query.queryKey),
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

  const normalizedAuthority = normalizeAuthority(readOptions?.authority)
  const queryKey = buildPodcastEpisodesQueryKey(
    normalizedPodcastItunesId,
    normalizedAuthority,
    readOptions?.country
  )
  const data = queryClient.getQueryData(queryKey) as PodcastEpisodes | undefined
  const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0
  if (!data) {
    return undefined
  }

  const entry = {
    queryKey,
    data,
    updatedAt,
    staleAt: updatedAt + PODCAST_QUERY_CACHE_POLICY.episodes.staleTime,
    authority: normalizedAuthority,
  } satisfies PodcastEpisodesCacheEntry

  if (!readOptions?.allowStale && !isPodcastEpisodesCacheFresh(entry, readOptions?.now)) {
    return undefined
  }

  return clonePodcastEpisodes(data)
}

export function getPodcastEpisodesBootstrapSnapshot(
  queryClient: QueryClient,
  podcastItunesId: string,
  authority?: PodcastEpisodeListAuthority,
  country?: string
): PodcastEpisodesBootstrapSnapshot | undefined {
  const entries = getPodcastEpisodesCacheEntries(queryClient, podcastItunesId, country)
  if (entries.length === 0) {
    return undefined
  }

  const matchingEntries = entries.filter((entry) =>
    matchesPodcastEpisodeListAuthority(entry.authority, authority)
  )
  const entry = (matchingEntries[0] ?? entries[0]) satisfies PodcastEpisodesCacheEntry
  if (!entry) {
    return undefined
  }

  return {
    data: clonePodcastEpisodes(entry.data),
    updatedAt: matchingEntries.length > 0 || !normalizeAuthority(authority) ? entry.updatedAt : 0,
    isAuthoritative: matchingEntries.length > 0 || !normalizeAuthority(authority),
  }
}

export function writePodcastEpisodesToCache(
  queryClient: QueryClient,
  podcastItunesId: string,
  payload: PodcastEpisodes,
  options?: {
    now?: number
    authority?: PodcastEpisodeListAuthority
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
  }
  const normalizedAuthority = normalizeAuthority(options?.authority)
  const queryKey = buildPodcastEpisodesQueryKey(
    normalizedPodcastItunesId,
    normalizedAuthority,
    options?.country
  )

  queryClient.setQueryDefaults(queryKey, {
    gcTime: PODCAST_QUERY_CACHE_POLICY.episodes.gcTime,
  })

  queryClient.setQueryData(queryKey, cachePayload, { updatedAt: now })

  for (const entry of getPodcastEpisodesCacheEntries(
    queryClient,
    normalizedPodcastItunesId,
    options?.country
  )) {
    if (
      entry.queryKey.length === queryKey.length &&
      entry.queryKey.every((part, index) => part === queryKey[index])
    ) {
      continue
    }
    queryClient.removeQueries({ queryKey: entry.queryKey, exact: true })
  }

  return cachePayload
}

export function findEpisodeInPodcastEpisodesCache(
  queryClient: QueryClient,
  podcastItunesId: string,
  episodeGuid: string,
  authority?: PodcastEpisodeListAuthority,
  country?: string
): Episode | undefined {
  const normalizedEpisodeGuid = episodeGuid.trim()
  if (!normalizedEpisodeGuid) {
    return undefined
  }

  const exactEpisodeList = readPodcastEpisodesFromCache(queryClient, podcastItunesId, {
    authority,
    country,
  })

  return exactEpisodeList?.episodes.find((episode) => episode.guid === normalizedEpisodeGuid)
}
