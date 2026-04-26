/**
 * Lightweight episode title normalization for exact-match resolution.
 *
 * Normalizes:
 * - Leading/trailing whitespace
 * - Repeated internal whitespace
 * - Case differences
 * - Unicode normalization (NFC)
 * - Curly quotes vs straight quotes
 * - Common hyphen / dash variants
 * - Spaces around hyphens/dashes
 *
 * Keeps it lightweight - no heavy text-matching libraries.
 */

const HYPHEN_DASH_MAP: Record<string, string> = {
  '\u2010': '-', // Hyphen
  '\u2011': '-', // Non-breaking hyphen
  '\u2012': '-', // Figure dash
  '\u2013': '-', // En dash
  '\u2014': '-', // Em dash
  '\u2015': '-', // Horizontal bar
}

const CURVY_QUOTE_MAP: Record<string, string> = {
  '\u2018': "'", // Left single quotation mark
  '\u2019': "'", // Right single quotation mark
  '\u201A': "'", // Single low-9 quotation mark
  '\u201B': "'", // Single high-reversed-9 quotation mark
  '\u201C': '"', // Left double quotation mark
  '\u201D': '"', // Right double quotation mark
  '\u201E': '"', // Double low-9 quotation mark
  '\u201F': '"', // Double high-reversed-9 quotation mark
}

function replaceChars(input: string, mapping: Record<string, string>): string {
  let result = input
  for (const [from, to] of Object.entries(mapping)) {
    result = result.split(from).join(to)
  }
  return result
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function normalizeSpacesAroundHyphens(input: string): string {
  return input.replace(/\s*-\s*/g, '-')
}

function trimLeadingTrailingHyphens(input: string): string {
  return input.replace(/^-+|-+$/g, '')
}

function normalizeNFC(input: string): string {
  if (typeof input.normalize === 'function') {
    return input.normalize('NFC')
  }
  return input
}

/**
 * Normalize an episode title for exact-match comparison.
 * Returns a canonical lowercase form suitable for equality comparison.
 */
export function normalizeEpisodeTitle(title: string | null | undefined): string | null {
  if (!title || typeof title !== 'string') {
    return null
  }

  const trimmed = title.trim()
  if (!trimmed) {
    return null
  }

  let normalized = trimmed

  normalized = replaceChars(normalized, HYPHEN_DASH_MAP)
  normalized = replaceChars(normalized, CURVY_QUOTE_MAP)
  normalized = normalizeNFC(normalized)
  normalized = normalizeSpacesAroundHyphens(normalized)
  normalized = normalizeWhitespace(normalized)
  normalized = trimLeadingTrailingHyphens(normalized)
  normalized = normalized.toLowerCase()

  return normalized
}

/**
 * Check if two episode titles are exactly equal after normalization.
 */
export function titlesAreEqual(
  titleA: string | null | undefined,
  titleB: string | null | undefined
): boolean {
  const normalizedA = normalizeEpisodeTitle(titleA)
  const normalizedB = normalizeEpisodeTitle(titleB)

  if (normalizedA === null && normalizedB === null) {
    return true
  }
  if (normalizedA === null || normalizedB === null) {
    return false
  }

  return normalizedA === normalizedB
}
