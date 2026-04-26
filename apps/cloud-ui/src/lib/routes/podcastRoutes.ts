import { type EditorPicksRegion, SUPPORTED_CONTENT_REGIONS } from '../../constants/app'
import { isValidCompactKey } from './compactKey'

export type SupportedCountry = EditorPicksRegion

const SUPPORTED_COUNTRY_SET = new Set(SUPPORTED_CONTENT_REGIONS)

export function normalizeCountryParam(
  country: string | null | undefined
): SupportedCountry | undefined {
  if (typeof country !== 'string') return undefined
  const normalized = country.trim().toLowerCase()
  if (!normalized) return undefined
  return SUPPORTED_COUNTRY_SET.has(normalized as SupportedCountry)
    ? (normalized as SupportedCountry)
    : undefined
}

// ---------------------------------------------------------------------------
// Route topology: /podcast/$country/$id[/episodes | /$episodeKey]
// ---------------------------------------------------------------------------

interface BuildPodcastShowRouteArgs {
  country: string | undefined
  podcastId: string
  search?: { [x: string]: never }
}

interface BuildPodcastEpisodeRouteArgs {
  country: string | undefined
  podcastId: string
  episodeKey: string
  search?: { [x: string]: never }
}

interface BuildPodcastEpisodesRouteArgs {
  country: string | undefined
  podcastId: string
  search?: { [x: string]: never }
}

interface BuildTopEpisodeResolutionRouteArgs {
  country: string | undefined
  podcastId: string
  title: string
}

export interface PodcastShowRouteObject {
  to: '/podcast/$country/$id'
  params: {
    country: SupportedCountry
    id: string
  }
  search?: { [x: string]: never }
}

export interface PodcastEpisodeRouteObject {
  to: '/podcast/$country/$id/$episodeKey'
  params: {
    country: SupportedCountry
    id: string
    episodeKey: string
  }
  search?: { [x: string]: never }
}

export interface PodcastEpisodesRouteObject {
  to: '/podcast/$country/$id/episodes'
  params: {
    country: SupportedCountry
    id: string
  }
  search?: { [x: string]: never }
}

export interface TopEpisodeResolutionRouteObject {
  to: '/podcast/$country/$id/top-episode'
  params: {
    country: SupportedCountry
    id: string
  }
  search: {
    title: string
  }
}

export type PodcastRouteObject =
  | PodcastShowRouteObject
  | PodcastEpisodeRouteObject
  | PodcastEpisodesRouteObject
  | TopEpisodeResolutionRouteObject

export type PodcastContentRouteObject = PodcastShowRouteObject | PodcastEpisodeRouteObject

export type PodcastContentRouteWithState<TState> = PodcastContentRouteObject & {
  state?: TState
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

export function buildTopEpisodeResolutionRoute({
  country,
  podcastId,
  title,
}: BuildTopEpisodeResolutionRouteArgs): TopEpisodeResolutionRouteObject | null {
  const normalizedCountry = normalizeCountryParam(country)
  const normalizedPodcastId = podcastId.trim()
  const normalizedTitle = title.trim()

  if (!normalizedCountry || !normalizedPodcastId || !normalizedTitle) {
    return null
  }

  return {
    to: '/podcast/$country/$id/top-episode',
    params: {
      country: normalizedCountry,
      id: normalizedPodcastId,
    },
    search: {
      title: normalizedTitle,
    },
  }
}
