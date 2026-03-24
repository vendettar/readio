import { tokenizeFallback, tokenizeWithLocale } from './tokenizeWithLocale'

const NON_WORD_CHAR_REGEX = /[^\p{L}\p{N}'-]/gu
const EDGE_PUNCTUATION_REGEX = /^['-]+|['-]+$/g
const HAS_ALNUM_REGEX = /[\p{L}\p{N}]/u

/**
 * Normalize a token into the lookup/highlight comparable form.
 * Keeps internal apostrophes/hyphens and strips surrounding punctuation.
 */
export function normalizeInteractiveWord(token: string): string {
  return token
    .toLowerCase()
    .replace(NON_WORD_CHAR_REGEX, '')
    .replace(EDGE_PUNCTUATION_REGEX, '')
    .trim()
}

/**
 * Splits text into tokens (words and separators) while preserving delimiters.
 *
 * Phase 1 behavior guard:
 * - If language is omitted, keep deterministic legacy fallback behavior.
 * - Locale-aware segmentation is opt-in via explicit language param.
 */
export function tokenize(text: string, language?: string): string[] {
  if (!language) {
    return tokenizeFallback(text)
  }
  return tokenizeWithLocale(text, language)
}

/**
 * Checks whether a token is an interactive word candidate.
 */
export function isInteractiveWord(token: string): boolean {
  return HAS_ALNUM_REGEX.test(normalizeInteractiveWord(token))
}

export { tokenizeFallback, tokenizeWithLocale }
