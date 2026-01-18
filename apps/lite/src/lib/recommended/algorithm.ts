// src/lib/recommended/algorithm.ts
// Pure functions for recommendation algorithm logic
// Fully testable without network/cache/React dependencies

import type { RecommendedGroup, RecommendedPodcast } from './types'
import { extractGenresFromPool, getCategoryInfo, getDailySeed, seedShuffle } from './utils'

/**
 * Filter genres that haven't been tried yet
 */
export function filterUntriedGenres(
  allGenres: string[],
  triedCategoryIds: Set<string>,
  existingGroupIds: Set<string>
): string[] {
  return allGenres.filter((id) => !triedCategoryIds.has(id) && !existingGroupIds.has(id))
}

/**
 * Build seen feeds set from existing groups
 */
export function buildSeenFeedsSet(groups: RecommendedGroup[]): Set<string> {
  const seen = new Set<string>()
  groups.forEach((g) => {
    g.items.forEach((i) => {
      seen.add(i.feedUrl.toLowerCase())
    })
  })
  return seen
}

/**
 * Filter candidates by genre match
 */
export function filterCandidatesByGenre(
  candidates: RecommendedPodcast[],
  genreTerm: string
): RecommendedPodcast[] {
  const normalizedTerm = genreTerm.toLowerCase()
  return candidates.filter((p) =>
    p.genreNames.some((g) => g.toLowerCase().includes(normalizedTerm))
  )
}

/**
 * Deduplicate podcasts by feed URL (case-insensitive)
 */
export function deduplicateByFeed(
  podcasts: RecommendedPodcast[],
  seenFeeds: Set<string>
): RecommendedPodcast[] {
  const result: RecommendedPodcast[] = []
  const localSeen = new Set(seenFeeds)

  for (const podcast of podcasts) {
    const feedLower = podcast.feedUrl.toLowerCase()
    if (!localSeen.has(feedLower)) {
      result.push(podcast)
      localSeen.add(feedLower)
    }
  }

  return result
}

/**
 * Get shuffled genres for a given date (stable per day)
 */
export function getShuffledGenresForDate(pool: RecommendedPodcast[], seed?: number): string[] {
  const allGenres = extractGenresFromPool(pool)
  const topGenres = allGenres.slice(0, 20)
  const useSeed = seed ?? getDailySeed()
  return seedShuffle(topGenres, useSeed)
}

/**
 * Build recommendation group from podcasts
 */
export function buildGroup(genreId: string, podcasts: RecommendedPodcast[]): RecommendedGroup {
  const info = getCategoryInfo(genreId)
  return {
    id: genreId,
    label: info.label,
    term: info.term,
    items: podcasts,
  }
}

/**
 * Check if all genres have been tried
 */
export function allGenresTried(shuffledGenres: string[], triedCategoryIds: Set<string>): boolean {
  return shuffledGenres.every((id) => triedCategoryIds.has(id))
}

/**
 * Core algorithm: select next genres to recommend
 * Pure function - no side effects, fully testable
 *
 * @returns Object with selected genre IDs and whether to continue
 */
export function selectNextGenres(params: {
  shuffledGenres: string[]
  triedCategoryIds: Set<string>
  existingGroupIds: Set<string>
  desiredCount: number
}): { selectedIds: string[]; hasMore: boolean } {
  const { shuffledGenres, triedCategoryIds, existingGroupIds, desiredCount } = params

  const pending = filterUntriedGenres(shuffledGenres, triedCategoryIds, existingGroupIds)
  const selected = pending.slice(0, desiredCount)
  const hasMore = !allGenresTried(shuffledGenres, triedCategoryIds)

  return { selectedIds: selected, hasMore }
}
