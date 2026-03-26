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

export function buildPodcastLookupQueryKey(podcastId: string, country: string | null | undefined) {
  return ['podcast', 'lookup', podcastId.trim(), country ?? ''] as const
}

export function buildPodcastFeedQueryKey(normalizedFeedUrl: string | null | undefined) {
  return ['podcast', 'feed', (normalizedFeedUrl ?? '').trim()] as const
}

export function buildPodcastProviderEpisodesQueryKey(
  podcastId: string,
  country: string | null | undefined
) {
  return ['podcast', 'provider-episodes', podcastId.trim(), country ?? ''] as const
}
