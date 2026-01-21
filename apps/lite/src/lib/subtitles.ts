// src/lib/subtitles.ts

export interface subtitle {
  start: number
  end: number
  text: string
}

/**
 * Parse subtitle content (supports SRT and VTT)
 */
export function parseSubtitles(content: string): subtitle[] {
  // Normalize line endings and remove byte-order mark
  const normalized = content.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const subtitles: subtitle[] = []
  let i = 0

  // Optional: Skip WEBVTT header for VTT files
  if (lines[0]?.trim().toUpperCase() === 'WEBVTT') {
    i++
  }

  while (i < lines.length) {
    // Skip empty lines and non-timestamp lines
    while (i < lines.length && !lines[i].includes('-->')) {
      i++
    }
    if (i >= lines.length) break

    // Parse time line (some VTTs have settings after the time, we split by whitespace)
    const timeLine = lines[i].trim()
    // Match regex for: 00:00:00.000 --> 00:00:00.000 or 00:00.000 --> 00:00.000
    // We are flexible with HH: part
    const parts = timeLine.split(/\s+-->\s+/)
    if (parts.length >= 2) {
      const startTimeStr = parts[0]
      // End time might be followed by settings like "align:start"
      const endTimeStr = parts[1].split(/\s+/)[0]

      const start = parseTime(startTimeStr)
      const end = parseTime(endTimeStr)

      i++ // Advance past time line regardless of validation result

      // Only collect text and push if timestamps are valid numbers
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        const textLines: string[] = []
        while (i < lines.length && lines[i].trim() !== '') {
          const text = lines[i].trim()
          // Skip VTT style tags like <v Voice> or <b>
          const cleanText = text.replace(/<[^>]+>/g, '')
          if (cleanText) {
            textLines.push(cleanText)
          }
          i++
        }

        if (textLines.length > 0) {
          subtitles.push({
            start,
            end,
            text: textLines.join('\n'),
          })
        }
      }
    } else {
      i++
    }
  }

  return subtitles
}

/**
 * Backward compatibility alias
 */
export const parseSrt = parseSubtitles

/**
 * Parse time string to seconds
 * Handles:
 * - 00:00:00,000 (SRT)
 * - 00:00:00.000 (VTT)
 * - 00:00.000 (VTT short)
 */
function parseTime(timeStr: string): number {
  if (!timeStr || !timeStr.trim()) return Number.NaN
  const normalized = timeStr.trim().replace(',', '.')
  const [time, msStr] = normalized.split('.')

  // Ensure ms is at least valid
  const ms = msStr ? (parseInt(msStr, 10) || 0) / 1000 : 0

  const parts = time.split(':').map(Number)
  if (parts.some((p) => Number.isNaN(p))) return Number.NaN

  if (parts.length === 3) {
    const [h, m, s] = parts
    return h * 3600 + m * 60 + (s || 0) + ms
  }
  if (parts.length === 2) {
    const [m, s] = parts
    return m * 60 + (s || 0) + ms
  }
  if (parts.length === 1 && !Number.isNaN(parts[0])) {
    return parts[0] + ms
  }
  return Number.NaN
}

// Re-export time label formatter from shared utilities
export { formatTimeLabel } from './formatters'

/**
 * Find subtitle index for given time - optimized algorithm from original
 * Uses locality principle: most lookups are for current, next, or previous subtitle
 * O(1) for normal playback, O(n) worst case for seeks
 */
export function findSubtitleIndex(
  subtitles: subtitle[],
  time: number,
  currentIndex: number
): number {
  if (!subtitles.length) return -1

  // 1. Check if current index is still valid (most common case)
  if (currentIndex >= 0 && currentIndex < subtitles.length) {
    const current = subtitles[currentIndex]
    if (time >= current.start && time < current.end) {
      return currentIndex
    }
  }

  // 2. Check next subtitle (second most common - normal playback)
  if (currentIndex + 1 < subtitles.length) {
    const next = subtitles[currentIndex + 1]
    if (time >= next.start && time < next.end) {
      return currentIndex + 1
    }
  }

  // 3. Check previous subtitle (backward navigation)
  if (currentIndex - 1 >= 0) {
    const prev = subtitles[currentIndex - 1]
    if (time >= prev.start && time < prev.end) {
      return currentIndex - 1
    }
  }

  // 4. Fall back to binary search (seek/jump scenarios) - O(log n)
  let left = 0
  let right = subtitles.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const subtitle = subtitles[mid]

    if (time >= subtitle.start && time < subtitle.end) {
      return mid
    } else if (time < subtitle.start) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  return -1
}
