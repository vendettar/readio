// src/lib/htmlUtils.ts
import DOMPurify from 'dompurify'

const BR_REGEX = /<br\s*\/?>/gi
const P_CLOSE_REGEX = /<\/p>/gi
const DIV_CLOSE_REGEX = /<\/div>/gi
const LI_CLOSE_REGEX = /<\/li>/gi
const MULTI_SPACE_REGEX = /[ \t]+/g
const MULTI_NEWLINE_REGEX = /\n\s*\n\s*\n+/g
const ALL_WHITESPACE_REGEX = /\s+/g
// HTML utilities for cleaning and parsing content

/**
 * Strip HTML tags from a string and decode HTML entities
 */
export function stripHtml(html: string, options: { preserveLineBreaks?: boolean } = {}): string {
  if (!html) return ''

  // Replace block-level tags with newlines if we want to preserve structure
  let processedHtml = html
  if (options.preserveLineBreaks) {
    processedHtml = processedHtml
      .replace(BR_REGEX, '\n')
      .replace(P_CLOSE_REGEX, '\n\n')
      .replace(DIV_CLOSE_REGEX, '\n')
      .replace(LI_CLOSE_REGEX, '\n')
  }

  const tmp = document.createElement('div')
  tmp.innerHTML = processedHtml

  let text = tmp.textContent || tmp.innerText || ''

  if (options.preserveLineBreaks) {
    // Clean up multiple spaces but keep newlines
    text = text.replace(MULTI_SPACE_REGEX, ' ')
    // Normalize multiple newlines
    text = text.replace(MULTI_NEWLINE_REGEX, '\n\n')
    text = text.trim()
  } else {
    // Legacy behavior: clean up all whitespace including newlines
    text = text.replace(ALL_WHITESPACE_REGEX, ' ').trim()
  }

  return text
}

let didInitPurify = false

function initPurify(): void {
  if (didInitPurify) return
  // Ensure all links open safely in a new tab.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })

  // Remove visually empty elements (like <p>&nbsp;</p>) that create large gaps in RSS feeds
  DOMPurify.addHook('afterSanitizeElements', (node) => {
    if (node instanceof Element && node.tagName === 'P') {
      // Replace non-breaking spaces with regular spaces before trimming
      const content = node.textContent?.replace(/\u00A0/g, '').trim() || ''
      // If it has no text content and no children (like <img> or <br>), remove it
      if (!content && node.children.length === 0) {
        node.parentNode?.removeChild(node)
      }
    }
  })
  didInitPurify = true
}

/**
 * Sanitize HTML to prevent XSS, while preserving safe formatting and links.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  initPurify()
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] })
}

/**
 * Truncate text to a specific length and add ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text

  // Find last space before maxLength to avoid cutting words
  const truncated = text.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > 0) {
    return `${truncated.slice(0, lastSpace)}...`
  }

  return `${truncated}...`
}
