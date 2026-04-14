/**
 * Shared slug normalization utilities.
 */

const SLUG_SEPARATOR = '-'
const FALLBACK_TITLE_SLUG = 'episode'

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
    .replace(/['’`]+/g, '')
    .replace(/[^a-z0-9]+/g, SLUG_SEPARATOR)
    .replace(/-{2,}/g, SLUG_SEPARATOR)
    .replace(/^-|-$/g, '')

  return slug || FALLBACK_TITLE_SLUG
}
