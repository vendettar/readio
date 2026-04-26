import type { QueryClient } from '@tanstack/react-query'
import { readPodcastFeedSliceFromCanonicalCache, writePodcastFeedPageToCaches } from './feedCache'
import { type NormalizedFeedUrl, normalizeFeedUrl } from './feedUrl'
import discovery, { type ParsedFeed, type Podcast } from './index'
import {
  buildPodcastDetailQueryKey,
  buildPodcastFeedQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
  type PodcastFeedQueryOptions,
} from './podcastQueryContract'

export async function ensurePodcastDetail(
  queryClient: QueryClient,
  podcastItunesId: string,
  country: string | null | undefined,
  signal?: AbortSignal
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

interface EnsurePodcastFeedOptions extends PodcastFeedQueryOptions {
  signal?: AbortSignal
}

interface PodcastFeedPageOptions {
  limit?: number
  offset?: number
}

function sanitizePodcastFeedPageOptions(
  options?: PodcastFeedQueryOptions
): PodcastFeedPageOptions | undefined {
  if (!options) {
    return undefined
  }

  const limit = typeof options.limit === 'number' ? options.limit : undefined
  const offset = typeof options.offset === 'number' ? options.offset : undefined

  if (limit === undefined && offset === undefined) {
    return undefined
  }

  return { limit, offset }
}

export async function fetchAndCachePodcastFeedPage(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl,
  signal?: AbortSignal,
  options?: PodcastFeedPageOptions
): Promise<ParsedFeed> {
  const canonicalFeedUrl = normalizeFeedUrl(feedUrl)
  const fetchedFeed = await discovery.fetchPodcastFeed(canonicalFeedUrl, signal, options)
  return writePodcastFeedPageToCaches(queryClient, canonicalFeedUrl, fetchedFeed, options)
}

export async function readOrFetchPodcastFeed(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl,
  signal?: AbortSignal,
  options?: PodcastFeedPageOptions
): Promise<ParsedFeed> {
  const canonicalFeedUrl = normalizeFeedUrl(feedUrl)
  const cachedCanonicalSlice = readPodcastFeedSliceFromCanonicalCache(
    queryClient,
    canonicalFeedUrl,
    options
  )
  if (cachedCanonicalSlice) {
    return cachedCanonicalSlice
  }

  return fetchAndCachePodcastFeedPage(queryClient, canonicalFeedUrl, signal, options)
}

export async function ensurePodcastFeed(
  queryClient: QueryClient,
  feedUrl: string | NormalizedFeedUrl,
  options?: EnsurePodcastFeedOptions
): Promise<ParsedFeed> {
  const canonicalFeedUrl = normalizeFeedUrl(feedUrl)
  const pagingOptions = sanitizePodcastFeedPageOptions(options)

  return queryClient.fetchQuery({
    queryKey: buildPodcastFeedQueryKey(canonicalFeedUrl, pagingOptions),
    queryFn: ({ signal: querySignal }) =>
      readOrFetchPodcastFeed(
        queryClient,
        canonicalFeedUrl,
        options?.signal ?? querySignal,
        pagingOptions
      ),
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })
}
