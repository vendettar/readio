import type { QueryClient } from '@tanstack/react-query'
import discovery, { type ParsedFeed, type Podcast } from './index'
import {
  buildPodcastDetailQueryKey,
  buildPodcastFeedQueryKey,
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

export async function ensurePodcastFeed(
  queryClient: QueryClient,
  feedUrl: string,
  signal?: AbortSignal
): Promise<ParsedFeed> {
  return queryClient.fetchQuery({
    queryKey: buildPodcastFeedQueryKey(feedUrl),
    queryFn: ({ signal: querySignal }) =>
      discovery.fetchPodcastFeed(feedUrl, signal ?? querySignal),
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })
}
