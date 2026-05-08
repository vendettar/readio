import { normalizeCountryParam } from '../routes/podcastRoutes'

export const PODCAST_EPISODES_QUERY_FAMILY = 'pi-list'

interface PodcastEpisodeListAuthorityKeyInput {
  lastUpdateTime?: number
  episodeCount?: number
}

export const PODCAST_QUERY_CACHE_POLICY = {
  podcastDetail: {
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
  episodes: {
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  },
} as const

function buildPodcastCountryToken(country: string | undefined) {
  const normalizedCountry = normalizeCountryParam(country)
  return normalizedCountry ? [`country-${normalizedCountry}`] : []
}

export function buildPodcastDetailQueryKey(podcastId: string, country?: string) {
  return ['podcast', 'podcast-detail', podcastId.trim(), ...buildPodcastCountryToken(country)] as const
}

export function buildPodcastEpisodesQueryKey(
  podcastId: string,
  authority?: PodcastEpisodeListAuthorityKeyInput,
  country?: string
) {
  return [
    ...buildPodcastEpisodesQueryPrefix(podcastId, country),
    ...buildPodcastEpisodesAuthorityTokens(authority),
  ] as const
}

export function buildPodcastEpisodesQueryPrefix(podcastId: string, country?: string) {
  return [
    'podcast',
    'episodes',
    podcastId.trim(),
    ...buildPodcastCountryToken(country),
    PODCAST_EPISODES_QUERY_FAMILY,
  ] as const
}

export function buildPodcastEpisodesAuthorityTokens(
  authority?: PodcastEpisodeListAuthorityKeyInput
) {
  const lastUpdateTimeToken =
    typeof authority?.lastUpdateTime === 'number' && Number.isFinite(authority.lastUpdateTime)
      ? authority.lastUpdateTime
      : 'na'
  const episodeCountToken =
    typeof authority?.episodeCount === 'number' && Number.isFinite(authority.episodeCount)
      ? authority.episodeCount
      : 'na'

  return [`lut-${lastUpdateTimeToken}`, `count-${episodeCountToken}`] as const
}
