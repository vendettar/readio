import type { QueryClient } from '@tanstack/react-query'
import discovery, { type ParsedFeed, type Podcast } from './index'
import {
  buildPodcastDetailQueryKey,
  buildPodcastFeedQueryKey,
  type PodcastFeedQueryOptions,
  PODCAST_QUERY_CACHE_POLICY,
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
      discovery.getPodcastIndexPodcastByItunesId(
        normalizedPodcastItunesId,
        signal ?? querySignal
      ),
    staleTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.gcTime,
  })
}

interface EnsurePodcastFeedOptions extends PodcastFeedQueryOptions {
  signal?: AbortSignal
}

export async function ensurePodcastFeed(
  queryClient: QueryClient,
  feedUrl: string,
  options?: EnsurePodcastFeedOptions
): Promise<ParsedFeed> {
  const pagingOptions =
    options && (typeof options.limit === 'number' || typeof options.offset === 'number')
      ? {
          limit: typeof options.limit === 'number' ? options.limit : undefined,
          offset: typeof options.offset === 'number' ? options.offset : undefined,
        }
      : undefined

  return queryClient.fetchQuery({
    queryKey: buildPodcastFeedQueryKey(feedUrl, pagingOptions),
    queryFn: ({ signal: querySignal }) =>
      discovery.fetchPodcastFeed(feedUrl, options?.signal ?? querySignal, pagingOptions),
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })
}
