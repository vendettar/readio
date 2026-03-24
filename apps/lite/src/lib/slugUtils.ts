/**
 * Slug utilities for episode URL routing.
 *
 * Canonical format: `{titleSlug}-{shortId8}`
 * - titleSlug: lowercase ascii word tokens joined by hyphens
 * - shortId8: first 8 characters of the full episode ID, lowercased
 */

const SLUG_SEPARATOR = '-'
const SHORT_ID_LENGTH = 8
const FALLBACK_TITLE_SLUG = 'episode'
const SHORT_ID_PATTERN = /^[a-z0-9]{8}$/

function stableHashBase36(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Convert an episode ID into the fixed shortId8 token.
 * If the cleaned source ID is shorter than 8 chars, pad deterministically
 * with stable hash output to maintain fixed-length matching behavior.
 */
export function toShortId8Token(fullId: string): string {
  const cleanId = fullId.replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (cleanId.length >= SHORT_ID_LENGTH) {
    return cleanId.slice(0, SHORT_ID_LENGTH)
  }
  if (cleanId.length === 0) {
    return '00000000'
  }

  let suffix = ''
  let seed = cleanId
  while (cleanId.length + suffix.length < SHORT_ID_LENGTH) {
    seed = stableHashBase36(seed)
    suffix += seed
  }

  return `${cleanId}${suffix}`.slice(0, SHORT_ID_LENGTH)
}

/**
 * Normalize a title string into a URL-safe slug.
 * - Lowercases
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses repeated hyphens
 * - Trims leading/trailing hyphens
 * - Falls back to 'episode' if result is empty
 */
export function generateSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, SLUG_SEPARATOR)
    .replace(/-{2,}/g, SLUG_SEPARATOR)
    .replace(/^-|-$/g, '')

  return slug || FALLBACK_TITLE_SLUG
}

/**
 * Generate a full slug with embedded short ID.
 * Format: `{titleSlug}-{shortId8}`
 */
export function generateSlugWithId(title: string, fullId: string): string {
  const titleSlug = generateSlug(title)
  const shortId = toShortId8Token(fullId)
  return `${titleSlug}${SLUG_SEPARATOR}${shortId}`
}

/**
 * Parse a slug param into its title segment and short ID.
 * Returns null if the slug doesn't contain a valid short ID suffix.
 *
 * The short ID is always the last hyphen-separated segment (8 chars, hex-like).
 */
export function parseSlugWithId(value: string): { titleSlug: string; shortId: string } | null {
  if (!value) return null

  const lastHyphen = value.lastIndexOf(SLUG_SEPARATOR)
  if (lastHyphen === -1) return null

  const shortId = value.slice(lastHyphen + 1)
  if (!SHORT_ID_PATTERN.test(shortId)) return null

  const titleSlug = value.slice(0, lastHyphen)
  return { titleSlug: titleSlug || FALLBACK_TITLE_SLUG, shortId }
}
