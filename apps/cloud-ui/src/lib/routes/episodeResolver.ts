/**
 * Shared episode title resolver for Top Episodes navigation only.
 *
 * Resolution priority:
 * 1. Fetch canonical podcast detail using shared query helpers
 * 2. Fetch the canonical PI episode list using shared query helpers
 * 3. Scan episodes for exact normalized title match
 * 4. If the scanned episode list yields exactly one normalized exact-title match → episode route
 * 5. Otherwise fall back to podcast show route
 *
 * Performance cutoffs:
 * - 30-day date window (stop scanning if pubDate is older than today - 30 days)
 * - 60-episode cap (stop after scanning 60 episodes)
 *
 * Fast-path contract for SearchEpisode is separate - see trySearchEpisodeDirectRoute.
 */

import type { QueryClient } from '@tanstack/react-query'
import type { Episode, Podcast, SearchEpisode } from '@/lib/discovery'
import { ensurePodcastDetail, ensurePodcastEpisodes } from '@/lib/discovery/queryCache'
import { getCanonicalSearchEpisodeIdentity } from '@/lib/discovery/searchEpisodeContract'
import { episodeIdentityToCompactKey } from '@/lib/routes/compactKey'
import { normalizeEpisodeTitle } from '@/lib/routes/episodeTitleNormalization'
import {
  buildPodcastEpisodeRoute,
  buildPodcastShowRoute,
  normalizeCountryParam,
  type PodcastContentRouteObject,
  type PodcastEpisodeRouteObject,
  type PodcastShowRouteObject,
} from '@/lib/routes/podcastRoutes'

const DATE_CUTOFF_DAYS = 30
const MAX_EPISODES_TO_SCAN = 60

export interface ResolveEpisodeByTitleOptions {
  queryClient: QueryClient
  country: string
  podcastItunesId: string
  targetTitle: string | null | undefined
  signal?: AbortSignal
}

export interface ResolvedEpisodeRoute {
  type: 'episode'
  route: PodcastEpisodeRouteObject
}

export interface ResolvedShowRoute {
  type: 'show'
  route: PodcastShowRouteObject | null
}

export type ResolvedRoute = ResolvedEpisodeRoute | ResolvedShowRoute

function isWithinDateCutoff(pubDate: string | null | undefined): boolean {
  if (!pubDate) {
    return true // Cannot use this item to trigger cutoff
  }

  const parsed = new Date(pubDate)
  if (Number.isNaN(parsed.getTime())) {
    return true // Cannot parse date, don't trigger cutoff
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - DATE_CUTOFF_DAYS)
  cutoffDate.setHours(0, 0, 0, 0)

  return parsed.getTime() >= cutoffDate.getTime()
}

function buildEpisodeRouteFromEpisode(
  episode: Episode,
  country: string,
  podcastItunesId: string
): ResolvedEpisodeRoute | null {
  const guid = typeof episode.guid === 'string' ? episode.guid.trim() : ''
  if (!guid) return null

  const compactKey = episodeIdentityToCompactKey(guid)
  if (!compactKey) return null

  const route = buildPodcastEpisodeRoute({
    country,
    podcastId: podcastItunesId,
    episodeKey: compactKey,
  })

  if (!route) return null

  return {
    type: 'episode',
    route,
  }
}

/**
 * Resolve an episode route by title within a podcast's PI episode list.
 *
 * Resolution rules:
 * - Resolve within the fixed episode list returned by `episodes/byitunesid`
 * - Scan stops at 30-day cutoff or 60 episodes
 * - Returns episode route if the scanned episode list yields exactly one exact title match (normalized)
 * - Returns show route when the scanned episode list yields multiple exact-title matches or no match
 */
export async function resolveEpisodeByTitle(
  options: ResolveEpisodeByTitleOptions
): Promise<ResolvedRoute> {
  const { queryClient, country, podcastItunesId, targetTitle, signal } = options

  const normalizedCountry = normalizeCountryParam(country)
  if (!normalizedCountry || !podcastItunesId || !targetTitle) {
    return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
  }

  const normalizedTargetTitle = normalizeEpisodeTitle(targetTitle)
  if (!normalizedTargetTitle) {
    return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
  }

  // Step 1: Get canonical podcast detail
  let podcast: Podcast | null
  try {
    podcast = await ensurePodcastDetail(queryClient, podcastItunesId, signal)
  } catch {
    return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
  }

  if (!podcast) {
    return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
  }

  let episodes: Episode[]
  try {
    episodes = (
      await ensurePodcastEpisodes(queryClient, podcastItunesId, {
        signal,
        authority: {
          lastUpdateTime: podcast.lastUpdateTime,
          episodeCount: podcast.episodeCount,
        },
      })
    ).episodes
  } catch {
    return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
  }

  let scannedCount = 0
  let matchedEpisode: Episode | null = null

  for (const episode of episodes) {
    if (scannedCount >= MAX_EPISODES_TO_SCAN) {
      break
    }

    const withinCutoff = isWithinDateCutoff(episode.pubDate)
    scannedCount++

    if (!withinCutoff) {
      break
    }

    const episodeNormalizedTitle = normalizeEpisodeTitle(episode.title)
    if (episodeNormalizedTitle === normalizedTargetTitle) {
      if (matchedEpisode !== null) {
        return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
      }
      matchedEpisode = episode
    }
  }

  if (matchedEpisode) {
    return (
      buildEpisodeRouteFromEpisode(matchedEpisode, normalizedCountry, podcastItunesId) ??
      buildFallbackShowRoute(normalizedCountry, podcastItunesId)
    )
  }

  return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
}

function buildFallbackShowRoute(
  country: string | undefined,
  podcastItunesId: string
): ResolvedShowRoute {
  return {
    type: 'show',
    route: buildPodcastShowRoute({ country, podcastId: podcastItunesId }),
  }
}

/**
 * SearchEpisode direct-route fast path.
 *
 * Rules (per 029 spec):
 * - Only for SearchEpisode (not generic episode rows or TopEpisode title resolution)
 * - Only when all required fields are valid: country, podcastItunesId, episodeGuid, compactKey
 * - MUST NOT trigger podcast-detail lookup
 * - MUST NOT trigger feed-title resolution
 * - MUST NOT add route query hints
 */
export function trySearchEpisodeDirectRoute(
  podcastItunesId: string,
  episodeGuid: string,
  country: string
): ResolvedEpisodeRoute | null {
  const normalizedEpisodeGuid = episodeGuid.trim()
  if (!normalizedEpisodeGuid) {
    return null
  }

  const compactKey = episodeIdentityToCompactKey(normalizedEpisodeGuid)
  if (!compactKey) {
    return null
  }

  const route = buildPodcastEpisodeRoute({
    country,
    podcastId: podcastItunesId,
    episodeKey: compactKey,
  })

  if (!route) {
    return null
  }

  return {
    type: 'episode',
    route,
  }
}

export function buildSearchEpisodeRoute(
  episode: Pick<SearchEpisode, 'podcastItunesId' | 'guid'>,
  country: string | undefined
): PodcastContentRouteObject | null
export function buildSearchEpisodeRoute(
  podcastItunesId: string,
  episodeGuid: string,
  country: string | undefined
): PodcastContentRouteObject | null
export function buildSearchEpisodeRoute(
  episodeOrPodcastItunesId: string | Pick<SearchEpisode, 'podcastItunesId' | 'guid'>,
  episodeGuidOrCountry: string | undefined,
  maybeCountry?: string | undefined
): PodcastContentRouteObject | null {
  const identity =
    typeof episodeOrPodcastItunesId === 'string'
      ? {
          podcastItunesId: episodeOrPodcastItunesId,
          episodeGuid: episodeGuidOrCountry ?? '',
        }
      : getCanonicalSearchEpisodeIdentity(episodeOrPodcastItunesId)
  const resolvedCountry =
    typeof episodeOrPodcastItunesId === 'string' ? maybeCountry : episodeGuidOrCountry
  const normalizedPodcastItunesId = identity.podcastItunesId.trim()
  const normalizedEpisodeGuid = identity.episodeGuid.trim()
  const normalizedCountry = normalizeCountryParam(resolvedCountry)
  if (normalizedCountry && normalizedEpisodeGuid) {
    const direct = trySearchEpisodeDirectRoute(
      normalizedPodcastItunesId,
      normalizedEpisodeGuid,
      normalizedCountry
    )
    if (direct) return direct.route
  }
  return buildPodcastShowRoute({
    country: resolvedCountry,
    podcastId: normalizedPodcastItunesId,
  })
}

/**
 * Check if an episode row already has a stable canonical identity.
 * If so, we can skip the resolver and use it directly.
 */
export function tryDirectEpisodeRoute(
  episode: Episode,
  country: string,
  podcastItunesId: string
): ResolvedEpisodeRoute | null {
  const normalizedCountry = normalizeCountryParam(country)
  if (!normalizedCountry || !podcastItunesId) return null
  return buildEpisodeRouteFromEpisode(episode, normalizedCountry, podcastItunesId)
}
