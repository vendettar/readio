import { type EditorPicksRegion, SUPPORTED_CONTENT_REGIONS } from '../../constants/app'
import { isValidCompactKey } from './compactKey'

export type SupportedCountry = EditorPicksRegion

const SUPPORTED_COUNTRY_SET = new Set(SUPPORTED_CONTENT_REGIONS)

export function normalizeCountryParam(country: string | null | undefined): SupportedCountry | null {
  if (typeof country !== 'string') return null
  const normalized = country.trim().toLowerCase()
  if (!normalized) return null
  return SUPPORTED_COUNTRY_SET.has(normalized as SupportedCountry)
    ? (normalized as SupportedCountry)
    : null
}

// ---------------------------------------------------------------------------
// Route topology: /podcast/$country/$id[/episodes | /$episodeKey]
// ---------------------------------------------------------------------------

interface BuildPodcastShowRouteArgs {
  country: string | null | undefined
  podcastId: string
  search?: { [x: string]: never }
}

interface BuildPodcastEpisodeRouteArgs {
  country: string | null | undefined
  podcastId: string
  episodeKey: string
  search?: { [x: string]: never }
}

interface BuildPodcastEpisodesRouteArgs {
  country: string | null | undefined
  podcastId: string
  search?: { [x: string]: never }
}

interface PodcastShowRouteObject {
  to: '/podcast/$country/$id'
  params: {
    country: SupportedCountry
    id: string
  }
  search?: { [x: string]: never }
}

interface PodcastEpisodeRouteObject {
  to: '/podcast/$country/$id/$episodeKey'
  params: {
    country: SupportedCountry
    id: string
    episodeKey: string
  }
  search?: { [x: string]: never }
}

interface PodcastEpisodesRouteObject {
  to: '/podcast/$country/$id/episodes'
  params: {
    country: SupportedCountry
    id: string
  }
  search?: { [x: string]: never }
}

export function buildPodcastShowRoute({
  country,
  podcastId,
  search,
}: BuildPodcastShowRouteArgs): PodcastShowRouteObject | null {
  const normalizedCountry = normalizeCountryParam(country)
  const normalizedPodcastId = podcastId.trim()
  if (!normalizedCountry || !normalizedPodcastId) {
    return null
  }

  return {
    to: '/podcast/$country/$id',
    params: {
      country: normalizedCountry,
      id: normalizedPodcastId,
    },
    ...(search ? { search } : {}),
  }
}

export function buildPodcastEpisodeRoute({
  country,
  podcastId,
  episodeKey,
  search,
}: BuildPodcastEpisodeRouteArgs): PodcastEpisodeRouteObject | null {
  const normalizedCountry = normalizeCountryParam(country)
  const normalizedPodcastId = podcastId.trim()
  const normalizedKey = episodeKey.trim()

  if (!normalizedCountry || !normalizedPodcastId || !isValidCompactKey(normalizedKey)) {
    return null
  }

  return {
    to: '/podcast/$country/$id/$episodeKey',
    params: {
      country: normalizedCountry,
      id: normalizedPodcastId,
      episodeKey: normalizedKey,
    },
    ...(search ? { search } : {}),
  }
}

export function buildPodcastEpisodesRoute({
  country,
  podcastId,
  search,
}: BuildPodcastEpisodesRouteArgs): PodcastEpisodesRouteObject | null {
  const normalizedCountry = normalizeCountryParam(country)
  const normalizedPodcastId = podcastId.trim()
  if (!normalizedCountry || !normalizedPodcastId) {
    return null
  }

  return {
    to: '/podcast/$country/$id/episodes',
    params: {
      country: normalizedCountry,
      id: normalizedPodcastId,
    },
    ...(search ? { search } : {}),
  }
}
