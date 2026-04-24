import { normalizeFeedUrl } from './feedUrl'

export const PODCAST_DEFAULT_FEED_QUERY_LIMIT = 20

export const PODCAST_QUERY_CACHE_POLICY = {
  podcastDetail: {
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
  feed: {
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
} as const

export function buildPodcastDetailQueryKey(
  podcastId: string,
  country: string | null | undefined
) {
  return ['podcast', 'podcast-detail', podcastId.trim(), country ?? ''] as const
}

export interface PodcastFeedQueryOptions {
  limit?: number | null
  offset?: number | null
}

function isPositiveFeedLimit(limit: number | null | undefined) {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0
}

function isNonNegativeFeedOffset(offset: number | null | undefined) {
  return typeof offset === 'number' && Number.isFinite(offset) && offset >= 0
}

export function buildPodcastFeedQueryKey(
  normalizedFeedUrl: string | null | undefined,
  options?: PodcastFeedQueryOptions
) {
  const hasPagedWindow = isPositiveFeedLimit(options?.limit)
  const modeToken = hasPagedWindow ? 'page' : 'full'
  const limitToken = hasPagedWindow ? options?.limit : 'all'
  const offsetToken = hasPagedWindow && isNonNegativeFeedOffset(options?.offset) ? options?.offset : 0

  return [
    'podcast',
    'feed',
    normalizeFeedUrl(normalizedFeedUrl ?? ''),
    modeToken,
    limitToken,
    offsetToken,
  ] as const
}
