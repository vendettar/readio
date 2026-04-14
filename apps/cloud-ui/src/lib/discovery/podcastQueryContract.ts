export const PODCAST_QUERY_CACHE_POLICY = {
  lookup: {
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

export function buildPodcastIndexLookupQueryKey(
  podcastId: string,
  country: string | null | undefined
) {
  return ['podcast', 'podcast-index-lookup', podcastId.trim(), country ?? ''] as const
}

export function buildPodcastFeedQueryKey(normalizedFeedUrl: string | null | undefined) {
  return ['podcast', 'feed', (normalizedFeedUrl ?? '').trim()] as const
}

export function buildPodcastIndexEpisodesQueryKey(
  podcastId: string,
  country: string | null | undefined
) {
  return ['podcast', 'podcast-index-episodes', podcastId.trim(), country ?? ''] as const
}
