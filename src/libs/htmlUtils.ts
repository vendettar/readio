// src/libs/htmlUtils.ts
// HTML utilities for cleaning and parsing content

/**
 * Strip HTML tags from a string and decode HTML entities
 */
export function stripHtml(html: string): string {
  if (!html) return ''

  // Create a temporary div to use browser's HTML parsing
  const tmp = document.createElement('div')
  tmp.innerHTML = html

  // Get text content (automatically decodes entities)
  let text = tmp.textContent || tmp.innerText || ''

  // Clean up extra whitespace
  text = text.replace(/\s+/g, ' ').trim()

  return text
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
