import { normalizeFeedUrl } from './feedUrl'

export const PODCAST_QUERY_CACHE_POLICY = {
  podcastDetail: {
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
  feed: {
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
  providerEpisodes: {
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
} as const

export function buildPodcastDetailQueryKey(
  podcastId: string,
  country: string | null | undefined
) {
  return ['podcast', 'podcast-detail', podcastId.trim(), country ?? ''] as const
}

export function buildPodcastFeedQueryKey(normalizedFeedUrl: string | null | undefined) {
  return ['podcast', 'feed', normalizeFeedUrl(normalizedFeedUrl ?? '')] as const
}
