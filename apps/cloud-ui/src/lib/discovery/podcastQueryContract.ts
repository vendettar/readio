import { normalizeCountryParam } from '../routes/podcastRoutes'

export const PODCAST_EPISODES_PAGE_SIZE = 20

export const PODCAST_QUERY_CACHE_POLICY = {
  podcastDetail: {
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
  episodes: {
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
} as const

export const PODCAST_QUERY_REFETCH_POLICY = {
  refetchOnReconnect: false,
} as const

function buildPodcastCountryToken(country: string | undefined) {
  const normalizedCountry = normalizeCountryParam(country)
  return normalizedCountry ? [`country-${normalizedCountry}`] : []
}

export function buildPodcastDetailQueryKey(podcastId: string, country?: string) {
  return ['podcast', 'detail', podcastId.trim(), ...buildPodcastCountryToken(country)] as const
}

export function buildPodcastEpisodeDetailQueryKey(
  podcastId: string,
  episodeGuid: string,
  country?: string
) {
  return [
    'podcast',
    'episode-detail',
    podcastId.trim(),
    ...buildPodcastCountryToken(country),
    episodeGuid.trim(),
  ] as const
}

export function buildPodcastEpisodesPagesQueryKey(podcastId: string, country?: string) {
  return [
    'podcast',
    'episodes-pages',
    podcastId.trim(),
    ...buildPodcastCountryToken(country),
  ] as const
}
