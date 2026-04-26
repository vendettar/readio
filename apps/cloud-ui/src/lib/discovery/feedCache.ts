import type { QueryClient } from '@tanstack/react-query'
import { getEpisodeGuid } from './editorPicks'
import { type NormalizedFeedUrl, normalizeFeedUrl } from './feedUrl'
import type { FeedEpisode, ParsedFeed } from './index'
import {
  buildPodcastCanonicalFeedQueryKey,
  buildPodcastFeedQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
  type PodcastFeedQueryOptions,
} from './podcastQueryContract'

interface FeedCoverageRange {
  start: number
  end: number
}

export interface CanonicalPodcastFeedCacheEntry {
  feedUrl: NormalizedFeedUrl
  title: string
  description: string
  artworkUrl?: string
  updatedAt: number
  staleAt: number
  episodesByIndex: Array<FeedEpisode | undefined>
  coveredRanges: FeedCoverageRange[]
  terminalEndExclusive?: number
}

interface CanonicalFeedReadOptions {
  allowStale?: boolean
  now?: number
}

export interface PodcastFeedBootstrapSnapshot {
  data: ParsedFeed
  updatedAt: number
}

interface CanonicalFeedMutableShape {
  feedUrl: NormalizedFeedUrl
  title: string
  description: string
  artworkUrl: string | undefined
  updatedAt: number
  staleAt: number
  episodesByIndex: Array<FeedEpisode | undefined>
  coveredRanges: FeedCoverageRange[]
  terminalEndExclusive?: number
}

function sanitizeFeedWindowOptions(options?: PodcastFeedQueryOptions) {
  const limit =
    typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
      ? options.limit
      : undefined
  const offset =
    typeof options?.offset === 'number' && Number.isFinite(options.offset) && options.offset >= 0
      ? options.offset
      : 0

  return { limit, offset }
}

function mergeCoverageRanges(ranges: FeedCoverageRange[]): FeedCoverageRange[] {
  if (ranges.length === 0) {
    return []
  }

  const sortedRanges = [...ranges].sort((left, right) => left.start - right.start)
  const firstRange = sortedRanges[0]
  if (!firstRange) {
    return []
  }
  const mergedRanges: FeedCoverageRange[] = [firstRange]

  for (let index = 1; index < sortedRanges.length; index += 1) {
    const nextRange = sortedRanges[index]
    if (!nextRange) {
      break
    }
    const lastRange = mergedRanges[mergedRanges.length - 1]
    if (!lastRange) {
      break
    }

    if (nextRange.start <= lastRange.end) {
      lastRange.end = Math.max(lastRange.end, nextRange.end)
      continue
    }

    mergedRanges.push({ ...nextRange })
  }

  return mergedRanges
}

function inferCoverageFromFeedPage(feedPage: ParsedFeed, options?: PodcastFeedQueryOptions) {
  const { limit, offset } = sanitizeFeedWindowOptions(options)
  const coverage = {
    start: offset,
    end: offset + feedPage.episodes.length,
  }

  const terminalEndExclusive =
    limit === undefined
      ? offset + feedPage.episodes.length
      : feedPage.pageInfo?.hasMore === false
        ? offset + feedPage.episodes.length
        : undefined

  return {
    coverage,
    terminalEndExclusive,
  }
}

function normalizeFeedPageForRequestedWindow(
  feedPage: ParsedFeed,
  options?: PodcastFeedQueryOptions
): ParsedFeed {
  const { limit, offset } = sanitizeFeedWindowOptions(options)
  if (limit === undefined) {
    return feedPage
  }

  return {
    ...feedPage,
    pageInfo: {
      limit,
      offset,
      returned: feedPage.episodes.length,
      hasMore:
        typeof feedPage.pageInfo?.hasMore === 'boolean'
          ? feedPage.pageInfo.hasMore
          : feedPage.episodes.length >= limit,
    },
  }
}

function isRangeCovered(ranges: FeedCoverageRange[], start: number, end: number) {
  if (end <= start) {
    return true
  }

  return ranges.some((range) => range.start <= start && range.end >= end)
}

function isDefinedEpisode(episode: FeedEpisode | undefined): episode is FeedEpisode {
  return episode !== undefined
}

function buildCanonicalFreshness(now: number) {
  return {
    updatedAt: now,
    staleAt: now + PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
  }
}

function getFeedEpisodeIdentity(episode: FeedEpisode | undefined): string | undefined {
  if (!episode) {
    return undefined
  }

  return getEpisodeGuid(episode) ?? episode.audioUrl ?? `${episode.title}|${episode.pubDate}`
}

function hasPageZeroHeadDrift(
  currentValue: CanonicalPodcastFeedCacheEntry | undefined,
  nextEpisodes: FeedEpisode[]
): boolean {
  if (!currentValue) {
    return false
  }

  const cachedHead = currentValue.episodesByIndex.slice(0, nextEpisodes.length)
  if (cachedHead.length !== nextEpisodes.length) {
    return true
  }

  return nextEpisodes.some((episode, index) => {
    return getFeedEpisodeIdentity(cachedHead[index]) !== getFeedEpisodeIdentity(episode)
  })
}

function trimEntryToTerminalEnd(
  entry: CanonicalFeedMutableShape,
  terminalEndExclusive: number | undefined
): CanonicalFeedMutableShape {
  if (terminalEndExclusive === undefined) {
    return entry
  }

  return {
    ...entry,
    episodesByIndex: entry.episodesByIndex.slice(0, terminalEndExclusive),
    coveredRanges: entry.coveredRanges
      .map((range) => ({
        start: range.start,
        end: Math.min(range.end, terminalEndExclusive),
      }))
      .filter((range) => range.start < range.end),
    terminalEndExclusive,
  }
}

function removeInvalidatedFeedWindowQueries(
  queryClient: QueryClient,
  feedUrl: NormalizedFeedUrl,
  currentPageQueryKey: ReturnType<typeof buildPodcastFeedQueryKey>
) {
  const [, , , currentMode, currentLimit, currentOffset] = currentPageQueryKey
  queryClient.removeQueries({
    predicate: (query) => {
      const key = query.queryKey
      return (
        Array.isArray(key) &&
        key.length === 6 &&
        key[0] === 'podcast' &&
        key[1] === 'feed' &&
        key[2] === feedUrl &&
        (key[3] !== currentMode || key[4] !== currentLimit || key[5] !== currentOffset)
      )
    },
  })
}

export function getCanonicalPodcastFeedCacheEntry(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl | '' | null | undefined
): CanonicalPodcastFeedCacheEntry | undefined {
  if (!feedUrl) {
    return undefined
  }

  const normalizedFeedUrl = normalizeFeedUrl(feedUrl)
  return queryClient.getQueryData(buildPodcastCanonicalFeedQueryKey(normalizedFeedUrl)) as
    | CanonicalPodcastFeedCacheEntry
    | undefined
}

export function getCanonicalPodcastFeedCacheUpdatedAt(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl | '' | null | undefined
): number | undefined {
  return getCanonicalPodcastFeedCacheEntry(queryClient, feedUrl)?.updatedAt
}

export function getPodcastFeedBootstrapSnapshot(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl | '' | null | undefined,
  options?: PodcastFeedQueryOptions
): PodcastFeedBootstrapSnapshot | undefined {
  const entry = getCanonicalPodcastFeedCacheEntry(queryClient, feedUrl)
  if (!entry) {
    return undefined
  }

  const data = readPodcastFeedSliceFromCanonicalCache(queryClient, feedUrl, options, {
    allowStale: true,
    now: entry.updatedAt,
  })
  if (!data) {
    return undefined
  }

  return {
    data,
    updatedAt: entry.updatedAt,
  }
}

export function isCanonicalPodcastFeedCacheFresh(
  entry: CanonicalPodcastFeedCacheEntry | null | undefined,
  now = Date.now()
): boolean {
  return Boolean(entry && entry.staleAt > now)
}

export function writePodcastFeedPageToCaches(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl,
  feedPage: ParsedFeed,
  options?: PodcastFeedQueryOptions,
  now = Date.now()
): ParsedFeed {
  const normalizedFeedUrl = normalizeFeedUrl(feedUrl)
  const normalizedFeedPage = normalizeFeedPageForRequestedWindow(feedPage, options)
  const currentPageQueryKey = buildPodcastFeedQueryKey(normalizedFeedUrl, options)
  let shouldInvalidatePriorWindowQueries = false
  const nextEntry = queryClient.setQueryData(
    buildPodcastCanonicalFeedQueryKey(normalizedFeedUrl),
    (currentValue: CanonicalPodcastFeedCacheEntry | undefined) => {
      const { coverage, terminalEndExclusive } = inferCoverageFromFeedPage(
        normalizedFeedPage,
        options
      )
      const isStalePageZeroRefresh =
        coverage.start === 0 &&
        Boolean(currentValue) &&
        !isCanonicalPodcastFeedCacheFresh(currentValue, now)
      const shouldResetToNewHeadBaseline =
        isStalePageZeroRefresh && hasPageZeroHeadDrift(currentValue, normalizedFeedPage.episodes)
      let nextValue: CanonicalFeedMutableShape = shouldResetToNewHeadBaseline
        ? {
            feedUrl: normalizedFeedUrl,
            title: normalizedFeedPage.title,
            description: normalizedFeedPage.description,
            artworkUrl: normalizedFeedPage.artworkUrl,
            ...buildCanonicalFreshness(now),
            episodesByIndex: [],
            coveredRanges: [],
            terminalEndExclusive: undefined,
          }
        : {
            ...(currentValue ?? {
              episodesByIndex: [],
              coveredRanges: [],
              terminalEndExclusive: undefined,
            }),
            feedUrl: normalizedFeedUrl,
            title: normalizedFeedPage.title,
            description: normalizedFeedPage.description,
            artworkUrl: normalizedFeedPage.artworkUrl,
            ...buildCanonicalFreshness(now),
          }

      if (shouldResetToNewHeadBaseline) {
        shouldInvalidatePriorWindowQueries = true
      }

      const episodesByIndex = [...nextValue.episodesByIndex]

      normalizedFeedPage.episodes.forEach((episode, index) => {
        episodesByIndex[coverage.start + index] = episode
      })

      nextValue = trimEntryToTerminalEnd(
        {
          ...nextValue,
          episodesByIndex,
          coveredRanges: mergeCoverageRanges([...nextValue.coveredRanges, coverage]),
          terminalEndExclusive:
            terminalEndExclusive === undefined
              ? nextValue.terminalEndExclusive
              : nextValue.terminalEndExclusive === undefined
                ? terminalEndExclusive
                : Math.min(nextValue.terminalEndExclusive, terminalEndExclusive),
        },
        terminalEndExclusive
      )

      if (
        currentValue?.terminalEndExclusive !== undefined &&
        nextValue.terminalEndExclusive !== undefined &&
        nextValue.terminalEndExclusive < currentValue.terminalEndExclusive
      ) {
        shouldInvalidatePriorWindowQueries = true
      }

      return {
        ...nextValue,
      } satisfies CanonicalPodcastFeedCacheEntry
    },
    { updatedAt: now }
  ) as CanonicalPodcastFeedCacheEntry

  if (shouldInvalidatePriorWindowQueries) {
    removeInvalidatedFeedWindowQueries(queryClient, normalizedFeedUrl, currentPageQueryKey)
  }

  queryClient.setQueryData(currentPageQueryKey, normalizedFeedPage, { updatedAt: now })

  if (isCanonicalFeedCoverageComplete(nextEntry)) {
    queryClient.setQueryData(
      buildPodcastFeedQueryKey(normalizedFeedUrl),
      materializePodcastFeedFromCanonicalEntry(nextEntry),
      { updatedAt: now }
    )
  } else {
    queryClient.removeQueries({
      queryKey: buildPodcastFeedQueryKey(normalizedFeedUrl),
      exact: true,
    })
  }

  return normalizedFeedPage
}

export function isCanonicalFeedCoverageComplete(
  entry: CanonicalPodcastFeedCacheEntry | null | undefined
): boolean {
  if (!entry || entry.terminalEndExclusive === undefined) {
    return false
  }

  return isRangeCovered(entry.coveredRanges, 0, entry.terminalEndExclusive)
}

export function materializePodcastFeedFromCanonicalEntry(
  entry: CanonicalPodcastFeedCacheEntry
): ParsedFeed {
  const episodeCount = entry.terminalEndExclusive ?? entry.episodesByIndex.length
  return {
    title: entry.title,
    description: entry.description,
    artworkUrl: entry.artworkUrl,
    episodes: entry.episodesByIndex.slice(0, episodeCount).filter(isDefinedEpisode),
  }
}

export function readPodcastFeedSliceFromCanonicalCache(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl | '' | null | undefined,
  options?: PodcastFeedQueryOptions,
  readOptions?: CanonicalFeedReadOptions
): ParsedFeed | undefined {
  const entry = getCanonicalPodcastFeedCacheEntry(queryClient, feedUrl)
  if (!entry) {
    return undefined
  }

  if (!readOptions?.allowStale && !isCanonicalPodcastFeedCacheFresh(entry, readOptions?.now)) {
    return undefined
  }

  const { limit, offset } = sanitizeFeedWindowOptions(options)

  if (limit === undefined) {
    return isCanonicalFeedCoverageComplete(entry)
      ? materializePodcastFeedFromCanonicalEntry(entry)
      : undefined
  }

  const terminalEndExclusive = entry.terminalEndExclusive
  const requestedEndExclusive =
    terminalEndExclusive === undefined
      ? offset + limit
      : Math.min(offset + limit, terminalEndExclusive)

  if (!isRangeCovered(entry.coveredRanges, offset, requestedEndExclusive)) {
    return undefined
  }

  const episodes = entry.episodesByIndex
    .slice(offset, requestedEndExclusive)
    .filter(isDefinedEpisode)
  const hasMore =
    terminalEndExclusive === undefined ? true : offset + episodes.length < terminalEndExclusive

  return {
    title: entry.title,
    description: entry.description,
    artworkUrl: entry.artworkUrl,
    pageInfo: {
      limit,
      offset,
      returned: episodes.length,
      hasMore,
    },
    episodes,
  }
}

export function findEpisodeInCanonicalPodcastFeed(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl | '' | null | undefined,
  predicate: (episode: FeedEpisode) => boolean
): FeedEpisode | undefined {
  const entry = getCanonicalPodcastFeedCacheEntry(queryClient, feedUrl)
  if (!entry) {
    return undefined
  }

  return entry.episodesByIndex.find(
    (episode): episode is FeedEpisode => episode !== undefined && predicate(episode)
  )
}
