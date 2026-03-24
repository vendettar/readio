// src/lib/subtitles.ts
import type { ASRCue } from './asr/types'

/**
 * Single source of truth for subtitle structure.
 * UI components and hooks should consume ASRCue[].
 */
export type { ASRCue, ASRWord } from './asr/types'

/**
 * Parse subtitle content (supports SRT and VTT) into structured cues
 */
export function parseSubtitles(content: string): ASRCue[] {
  // Normalize line endings and remove byte-order mark
  const normalized = content.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const cues: ASRCue[] = []
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
          cues.push({
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

  return cues
}

/**
 * Backward compatibility alias
 */
export const parseSrt = parseSubtitles

/**
 * Parse time string to seconds
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
 * Find subtitle index for given time - optimized algorithm
 */
export function findSubtitleIndex(cues: ASRCue[], time: number, currentIndex: number): number {
  if (!cues.length) return -1

  // 1. Check if current index is still valid (most common case)
  if (currentIndex >= 0 && currentIndex < cues.length) {
    const current = cues[currentIndex]
    if (time >= current.start && time < current.end) {
      return currentIndex
    }
  }

  // 2. Check next subtitle (second most common - normal playback)
  if (currentIndex + 1 < cues.length) {
    const next = cues[currentIndex + 1]
    if (time >= next.start && time < next.end) {
      return currentIndex + 1
    }
  }

  // 3. Check previous subtitle (backward navigation)
  if (currentIndex - 1 >= 0) {
    const prev = cues[currentIndex - 1]
    if (time >= prev.start && time < prev.end) {
      return currentIndex - 1
    }
  }

  // 4. Fall back to binary search (seek/jump scenarios) - O(log n)
  let left = 0
  let right = cues.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const cue = cues[mid]

    if (time >= cue.start && time < cue.end) {
      return mid
    } else if (time < cue.start) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  return -1
}

/**
 * Convert structured cues to SRT string (on-demand export)
 */
export function cuesToSrt(cues: ASRCue[]): string {
  return cues
    .map((cue, index) => {
      const start = formatSrtTimestamp(cue.start)
      const end = formatSrtTimestamp(cue.end)
      const text = cue.text.trim()
      return `${index + 1}\n${start} --> ${end}\n${text}\n`
    })
    .join('\n')
}

/**
 * Convert structured cues to VTT string (on-demand export or browser track)
 */
export function cuesToVtt(cues: ASRCue[]): string {
  const body = cues
    .map((cue) => {
      const start = formatVttTimestamp(cue.start)
      const end = formatVttTimestamp(cue.end)
      const text = cue.text.trim()
      return `${start} --> ${end}\n${text}\n`
    })
    .join('\n')
  return `WEBVTT\n\n${body}`
}

function formatSrtTimestamp(seconds: number): string {
  return formatTimestamp(seconds, ',')
}

function formatVttTimestamp(seconds: number): string {
  return formatTimestamp(seconds, '.')
}

function formatTimestamp(seconds: number, msSeparator: string): string {
  const safe = Math.max(0, seconds)
  const msTotal = Math.round(safe * 1000)
  const ms = msTotal % 1000
  const totalSeconds = Math.floor(msTotal / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)

  return `${h.toString().padStart(2, '0')}:${m
    .toString()
    .padStart(2, '0')}:${s.toString().padStart(2, '0')}${msSeparator}${ms
    .toString()
    .padStart(3, '0')}`
}

/**
 * Generate a canonical JSON string for fingerprinting
 */
export function serializeCuesCanonical(cues: ASRCue[]): string {
  // Ensure stable object order if we ever add more fields
  // For now ASRCue is simple enough that JSON.stringify is mostly stable
  // unless we want to be very strict about floating point precision.
  return JSON.stringify(cues, (key, value) => {
    if (typeof value === 'number' && (key === 'start' || key === 'end')) {
      // Round to 3 decimal places for fingerprint stability
      return Math.round(value * 1000) / 1000
    }
    return value
  })
}
