/**
 * Shared episode title resolver for Top Episodes navigation only.
 *
 * Resolution priority:
 * 1. Fetch canonical podcast detail using shared query helpers
 * 2. Fetch feed pages using shared query helpers (ensurePodcastFeed)
 * 3. Scan episodes for exact normalized title match
 * 4. If the current scanned page yields exactly one normalized exact-title match → episode route
 * 5. Otherwise fall back to podcast show route
 *
 * Performance cutoffs:
 * - 30-day date window (stop scanning if pubDate is older than today - 30 days)
 * - 60-episode cap (stop after scanning 60 feed episodes)
 *
 * Fast-path contract for SearchEpisode is separate - see trySearchEpisodeDirectRoute.
 */

import type { QueryClient } from '@tanstack/react-query'
import type { FeedEpisode, ParsedFeed, Podcast } from '@/lib/discovery'
import { ensurePodcastDetail, ensurePodcastFeed } from '@/lib/discovery/queryCache'
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
  country: string | null | undefined
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

function hasStableEpisodeIdentity(episode: FeedEpisode): boolean {
  if (!episode) return false
  const guid = episode.episodeGuid
  if (guid && typeof guid === 'string' && guid.trim().length > 0) {
    return true
  }
  return false
}

function buildEpisodeRouteFromFeedEpisode(
  episode: FeedEpisode,
  country: string,
  podcastItunesId: string
): ResolvedEpisodeRoute | null {
  const guid = episode.episodeGuid
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

async function fetchFeedPageByOffset(
  queryClient: QueryClient,
  feedUrl: string,
  offset: number
): Promise<{ feed: ParsedFeed; hasMore: boolean }> {
  const feed = await ensurePodcastFeed(queryClient, feedUrl, {
    limit: 20,
    offset,
  })

  const pageInfo = feed.pageInfo
  const hasMore = pageInfo && typeof pageInfo.hasMore === 'boolean' ? pageInfo.hasMore : false

  return { feed, hasMore }
}

/**
 * Resolve an episode route by title within a podcast's feed.
 *
 * Resolution rules:
 * - Resolve within the current scanned page only
 * - Do not fetch an additional page solely to disambiguate a match already found
 * - Scan stops at 30-day cutoff or 60 episodes
 * - Returns episode route if the current page yields exactly one exact title match (normalized)
 * - Returns show route when the current page yields multiple exact-title matches or no match
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
    podcast = await ensurePodcastDetail(queryClient, podcastItunesId, normalizedCountry, signal)
  } catch {
    return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
  }

  if (!podcast || !podcast.feedUrl) {
    return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
  }

  // Step 2: Fetch feed pages and scan for title match
  let offset = 0
  let scannedCount = 0
  let matchedEpisode: FeedEpisode | null = null

  while (scannedCount < MAX_EPISODES_TO_SCAN) {
    let feed: ParsedFeed
    let hasMore: boolean

    try {
      const result = await fetchFeedPageByOffset(queryClient, podcast.feedUrl, offset)
      feed = result.feed
      hasMore = result.hasMore
    } catch {
      return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
    }

    const episodes = feed.episodes ?? []

    for (const episode of episodes) {
      // Stop if we reached the scan limit
      if (scannedCount >= MAX_EPISODES_TO_SCAN) {
        break
      }

      // Check date cutoff before incrementing scan count
      const withinCutoff = isWithinDateCutoff(episode.pubDate)
      scannedCount++

      if (!withinCutoff) {
        // Date cutoff reached - stop entirely
        break
      }

      // Check title match
      const episodeNormalizedTitle = normalizeEpisodeTitle(episode.title)
      if (episodeNormalizedTitle === normalizedTargetTitle) {
        if (matchedEpisode !== null) {
          // Multiple matches - ambiguous, fall back to show
          return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
        }
        matchedEpisode = episode
      }
    }

    if (matchedEpisode) {
      return (
        buildEpisodeRouteFromFeedEpisode(matchedEpisode, normalizedCountry, podcastItunesId) ??
        buildFallbackShowRoute(normalizedCountry, podcastItunesId)
      )
    }

    if (!hasMore) {
      break
    }

    offset += 20
  }

  return buildFallbackShowRoute(normalizedCountry, podcastItunesId)
}

function buildFallbackShowRoute(
  country: string | undefined,
  podcastItunesId: string
): ResolvedShowRoute {
  return {
    type: 'show',
    route:
      country && podcastItunesId
        ? buildPodcastShowRoute({ country, podcastId: podcastItunesId })
        : null,
  }
}

/**
 * SearchEpisode direct-route fast path.
 *
 * Rules (per 029 spec):
 * - Only for SearchEpisode (not FeedEpisode or TopEpisode)
 * - Only when all required fields are valid: country, podcastItunesId, episodeGuid, compactKey
 * - MUST NOT trigger podcast-detail lookup
 * - MUST NOT trigger feed-title resolution
 * - MUST NOT add route query hints
 */
export function trySearchEpisodeDirectRoute(
  podcastItunesId: string | null | undefined,
  episodeGuid: string | null | undefined,
  country: string | null | undefined
): ResolvedEpisodeRoute | null {
  const normalizedCountry = normalizeCountryParam(country)
  if (!normalizedCountry || !podcastItunesId || !episodeGuid) {
    return null
  }

  const compactKey = episodeIdentityToCompactKey(episodeGuid)
  if (!compactKey) {
    return null
  }

  const route = buildPodcastEpisodeRoute({
    country: normalizedCountry,
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
  podcastItunesId: string | null | undefined,
  episodeGuid: string | null | undefined,
  country: string | null | undefined
): PodcastContentRouteObject | null {
  const direct = trySearchEpisodeDirectRoute(podcastItunesId, episodeGuid, country)
  if (direct) return direct.route
  if (!podcastItunesId) {
    return null
  }
  return buildPodcastShowRoute({ country: country ?? undefined, podcastId: podcastItunesId })
}

/**
 * Check if a feed episode already has a stable canonical identity.
 * If so, we can skip the resolver and use it directly.
 */
export function tryDirectEpisodeRoute(
  episode: FeedEpisode,
  country: string | null | undefined,
  podcastItunesId: string
): ResolvedEpisodeRoute | null {
  const normalizedCountry = normalizeCountryParam(country)
  if (!normalizedCountry || !podcastItunesId) return null

  if (hasStableEpisodeIdentity(episode)) {
    return buildEpisodeRouteFromFeedEpisode(episode, normalizedCountry, podcastItunesId)
  }

  return null
}
