// src/libs/subtitles.ts

export interface subtitle {
  start: number
  end: number
  text: string
}

/**
 * Parse SRT subtitle content
 */
export function parseSrt(content: string): subtitle[] {
  const lines = content.trim().split(/\r?\n/)
  const subtitles: subtitle[] = []
  let i = 0

  while (i < lines.length) {
    // Skip empty lines and subtitle index
    while (i < lines.length && !lines[i].includes('-->')) {
      i++
    }
    if (i >= lines.length) break

    // Parse time
    const timeLine = lines[i]
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    )

    if (timeMatch) {
      const start = parseTime(timeMatch[1])
      const end = parseTime(timeMatch[2])
      i++

      // Collect text lines
      const textLines: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i])
        i++
      }

      subtitles.push({
        start,
        end,
        text: textLines.join('\n'),
      })
    } else {
      i++
    }
  }

  return subtitles
}

/**
 * Parse time string to seconds
 */
function parseTime(timeStr: string): number {
  const [time, ms] = timeStr.replace(',', '.').split('.')
  const [h, m, s] = time.split(':').map(Number)
  return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000
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
