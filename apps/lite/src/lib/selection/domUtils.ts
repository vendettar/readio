// src/lib/selection/domUtils.ts
import { STOP_WORDS, WORD_PATTERN } from './constants'

export function isLookupEligible(text: string): boolean {
  const word = text.trim()
  if (!word || word.length > 64) return false
  if (!WORD_PATTERN.test(word)) return false
  return !STOP_WORDS.has(word.toLowerCase())
}

export function findWordAtPoint(
  _element: HTMLElement,
  x: number,
  y: number
): { word: string; range: Range } | null {
  let range: Range | null = null
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y)
  }
  if (!range) return null

  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return null

  const text = node.textContent || ''
  const offset = range.startOffset

  let start = offset
  let end = offset
  while (start > 0 && /[A-Za-z0-9''-]/.test(text[start - 1])) start--
  while (end < text.length && /[A-Za-z0-9''-]/.test(text[end])) end++

  const word = text.slice(start, end)
  if (!word || !/^[A-Za-z]/.test(word)) return null

  const wordRange = document.createRange()
  wordRange.setStart(node, start)
  wordRange.setEnd(node, end)

  return { word, range: wordRange }
}
