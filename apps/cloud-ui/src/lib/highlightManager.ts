// src/lib/highlightManager.ts
// CSS Highlights API for looked-up word highlighting
// Avoids DOM manipulation and React re-renders

import { log, error as logError, warn } from './logger'

const HIGHLIGHT_NAME = 'lookup-highlight'

// Check if CSS Highlights API is supported
export function isHighlightSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
}

// Create and register the highlight
let lookupHighlight: Highlight | null = null

export function initLookupHighlight(): boolean {
  if (!isHighlightSupported()) {
    warn('[Highlight] CSS Highlights API not supported')
    return false
  }

  if (lookupHighlight) return true

  try {
    lookupHighlight = new Highlight()
    CSS.highlights.set(HIGHLIGHT_NAME, lookupHighlight)
    log('[Highlight] Initialized lookup highlight')
    return true
  } catch (err) {
    logError('[Highlight] Failed to initialize:', err)
    return false
  }
}

/**
 * Clear all highlights
 */
export function clearLookupHighlights(): void {
  if (lookupHighlight) {
    lookupHighlight.clear()
  }
}

/**
 * Find and highlight all occurrences of a word in subtitle elements
 * Uses word boundary matching for accurate highlighting
 */
export function highlightWordInSubtitles(
  word: string,
  containerSelector = '.subtitle-text'
): number {
  if (!lookupHighlight || !word) return 0

  const normalizedWord = word.toLowerCase().trim()
  if (!normalizedWord) return 0

  // Create word boundary regex
  const wordRegex = new RegExp(`\\b${escapeRegExp(normalizedWord)}\\b`, 'gi')

  let count = 0
  const elements = document.querySelectorAll(containerSelector)

  elements.forEach((element) => {
    const segments = collectTextSegments(element)
    if (segments.length === 0) return
    const text = segments.map((segment) => segment.text).join('')
    // Reset global regex state per subtitle element to avoid cross-element skip.
    wordRegex.lastIndex = 0
    let match: RegExpExecArray | null

    // biome-ignore lint/suspicious/noAssignInExpressions: Loop pattern
    while ((match = wordRegex.exec(text)) !== null) {
      try {
        const start = resolveTextPosition(segments, match.index, false)
        const end = resolveTextPosition(segments, match.index + match[0].length, true)
        if (!start || !end) {
          continue
        }
        const range = document.createRange()
        range.setStart(start.node, start.offset)
        range.setEnd(end.node, end.offset)
        lookupHighlight?.add(range)
        count++
      } catch {
        // Range creation may fail for invalid positions
      }
    }
  })

  return count
}

interface TextSegment {
  node: Text
  text: string
  start: number
  end: number
}

function collectTextSegments(root: Element): TextSegment[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const segments: TextSegment[] = []
  let cursor = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const text = node.textContent ?? ''
    if (!text) continue
    segments.push({
      node,
      text,
      start: cursor,
      end: cursor + text.length,
    })
    cursor += text.length
  }

  return segments
}

function resolveTextPosition(
  segments: TextSegment[],
  index: number,
  isEnd: boolean
): { node: Text; offset: number } | null {
  for (const segment of segments) {
    const inSegment = isEnd
      ? index >= segment.start && index <= segment.end
      : index >= segment.start && index < segment.end

    if (!inSegment) continue
    return {
      node: segment.node,
      offset: index - segment.start,
    }
  }
  return null
}

/**
 * Highlight multiple words from cache
 */
export function highlightCachedWords(
  words: string[],
  containerSelector = '.subtitle-text'
): number {
  if (!lookupHighlight || words.length === 0) return 0

  let totalCount = 0
  for (const word of words) {
    totalCount += highlightWordInSubtitles(word, containerSelector)
  }
  return totalCount
}

/**
 * Rebuild highlights for all cached words
 * Call this after subtitle content changes (e.g., scroll, new content loads)
 */
export function rebuildHighlights(words: string[], containerSelector = '.subtitle-text'): number {
  clearLookupHighlights()
  return highlightCachedWords(words, containerSelector)
}

// Utility: escape regex special characters
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Cleanup
export function destroyLookupHighlight(): void {
  if (lookupHighlight) {
    lookupHighlight.clear()
    CSS.highlights.delete(HIGHLIGHT_NAME)
    lookupHighlight = null
  }
}
