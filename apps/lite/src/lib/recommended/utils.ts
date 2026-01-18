// src/lib/recommended/utils.ts
import { CATEGORY_INFO, RECOMMENDED_CATEGORY_IDS, type RecommendedPodcast } from './types'

/**
 * Get a daily seed based on current date
 */
export function getDailySeed(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  return year * 10000 + month * 100 + day
}

/**
 * Seeded pseudo-random number generator
 */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/**
 * Shuffle array with a seed for reproducible results
 */
export function seedShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array]
  const random = seededRandom(seed)

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

/**
 * Shuffle categories with daily seed
 */
export function getShuffledCategories(seed?: number): string[] {
  const s = seed ?? getDailySeed()
  return seedShuffle(RECOMMENDED_CATEGORY_IDS, s)
}

/**
 * Dynamically extract genre categories from podcast pool.
 */
export function extractGenresFromPool(podcasts: RecommendedPodcast[]): string[] {
  const genreCount = new Map<string, number>()

  for (const podcast of podcasts) {
    for (const genre of podcast.genreNames) {
      const normalized = genre.toLowerCase().replace(/\s+/g, '-')
      genreCount.set(normalized, (genreCount.get(normalized) || 0) + 1)
    }
  }

  return [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([genre]) => genre)
}

/**
 * Get or create category info for a genre ID.
 */
export function getCategoryInfo(genreId: string): { label: string; term: string } {
  if (CATEGORY_INFO[genreId]) {
    return CATEGORY_INFO[genreId]
  }
  const label = genreId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return { label, term: genreId.replace(/-/g, ' ') }
}
