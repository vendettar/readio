// src/lib/recommended/batch.ts
// Batch loading logic for recommended podcasts
// Uses pure algorithm functions for easy testing

import {
  allGenresTried,
  buildGroup,
  buildSeenFeedsSet,
  filterCandidatesByGenre,
  getShuffledGenresForDate,
  selectNextGenres,
} from './algorithm'
import { writeRecommendedCache } from './cache'
import { fetchTopPodcastsFromSource } from './sources'
import type { RecommendedGroup, RecommendedPodcast } from './types'
import { getCategoryInfo } from './utils'
import { pickCorsAllowedRecommended } from './validator'

const RECOMMENDED_PER_CATEGORY = 3

/**
 * Load a batch of recommended podcast groups
 *
 * @param country - Country code for discovery API
 * @param lang - Language code for caching
 * @param existingGroups - Already loaded groups
 * @param triedCategoryIds - Set of category IDs already attempted
 * @param options - Optional signal for abort and desired group count
 * @returns Object with loaded groups and completion status
 */
export async function loadRecommendedBatch(
  country: string,
  lang: string,
  existingGroups: RecommendedGroup[],
  triedCategoryIds: Set<string>,
  options: { signal?: AbortSignal; desiredGroups?: number } = {}
): Promise<{ groups: RecommendedGroup[]; allLoaded: boolean }> {
  const { signal, desiredGroups = 3 } = options
  const groups = [...existingGroups]

  // Build seen feeds set
  const seenFeeds = buildSeenFeedsSet(groups)

  // 1. Fetch pool of top podcasts
  const pool = await fetchTopPodcastsFromSource(country, 150, signal)
  if (pool.length === 0) {
    return { groups, allLoaded: true }
  }

  // 2. Get shuffled genres (stable per day)
  const shuffledGenres = getShuffledGenresForDate(pool)

  // 3. Select next genres to process
  const existingIds = new Set(groups.map((g) => g.id))
  const { selectedIds } = selectNextGenres({
    shuffledGenres,
    triedCategoryIds,
    existingGroupIds: existingIds,
    desiredCount: desiredGroups,
  })

  // 4. Process each selected genre
  for (const genreId of selectedIds) {
    if (signal?.aborted) break

    triedCategoryIds.add(genreId)

    // Find candidates for this genre
    const info = getCategoryInfo(genreId)
    const candidates = filterCandidatesByGenre(pool, info.term)

    if (candidates.length === 0) continue

    try {
      const picked = await pickCorsAllowedRecommended(country, candidates, {
        signal,
        desired: RECOMMENDED_PER_CATEGORY,
        seenFeeds,
      })

      if (picked.length === 0) continue

      groups.push(buildGroup(genreId, picked))
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') break
    }
  }

  // Mark as all loaded if we've tried all genres
  const allLoaded = allGenresTried(shuffledGenres, triedCategoryIds)

  if (groups.length > 0) {
    writeRecommendedCache(country, lang, groups)
  }

  return { groups, allLoaded }
}

/**
 * Fetch recommended podcast candidates for a specific category
 *
 * @param categoryId - Category/genre ID
 * @param country - Country code for iTunes API
 * @param signal - Optional abort signal
 * @returns Array of recommended podcasts matching the category
 */
export async function fetchRecommendedCandidates(
  categoryId: string,
  country: string,
  signal?: AbortSignal
): Promise<RecommendedPodcast[]> {
  const info = getCategoryInfo(categoryId)
  const pool = await fetchTopPodcastsFromSource(country, 150, signal)
  if (pool.length === 0) return []

  return filterCandidatesByGenre(pool, info.term)
}
