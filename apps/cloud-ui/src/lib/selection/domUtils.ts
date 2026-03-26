// src/lib/selection/domUtils.ts
import { STOP_WORDS, WORD_PATTERN } from './constants'

const HAS_WHITESPACE_PATTERN = /\s/u
const HAS_ALNUM_PATTERN = /[\p{L}\p{N}]/u

export function isLookupEligible(text: string): boolean {
  const word = text.trim()
  if (!word || word.length > 64) return false
  if (WORD_PATTERN.test(word)) {
    return !STOP_WORDS.has(word.toLowerCase())
  }
  if (HAS_WHITESPACE_PATTERN.test(word)) return false
  return HAS_ALNUM_PATTERN.test(word)
}
