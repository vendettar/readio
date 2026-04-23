// src/lib/subtitles.ts
import type { ASRCue } from './asr/types'

export type SubtitleExportFormat = 'srt' | 'vtt'
export const SUPPORTED_SUBTITLE_EXPORT_FORMATS = [
  'srt',
  'vtt',
] as const satisfies readonly SubtitleExportFormat[]

const SUBTITLE_EXPORT_MIME_TYPES: Record<SubtitleExportFormat, string> = {
  srt: 'application/x-subrip;charset=utf-8',
  vtt: 'text/vtt;charset=utf-8',
}

/**
 * Single source of truth for subtitle structure.
 * UI components and hooks should consume ASRCue[].
 */
export type { ASRCue, ASRWord } from './asr/types'

/**
 * Parse transcript/subtitle content (supports JSON, SRT, and VTT) into structured cues.
 */
export function parseSubtitles(content: string): ASRCue[] {
  // Normalize line endings and remove byte-order mark
  const normalized = content.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n')
  const trimmed = normalized.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      const rows = extractTranscriptRows(parsed)
      const cues: ASRCue[] = []

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const item = row as Record<string, unknown>
        const textValue =
          item.text ?? item.body ?? item.value ?? item.transcript ?? item.caption ?? item.line
        const text = typeof textValue === 'string' ? textValue.trim() : ''
        if (!text) continue

        const start =
          parseFlexibleTimestamp(
            item.start ??
              item.startTime ??
              item.start_time ??
              item.begin ??
              item.offset ??
              item.time ??
              item.ts
          ) ?? null
        if (start === null) continue

        const endFromField = parseFlexibleTimestamp(
          item.end ?? item.endTime ?? item.end_time ?? item.stop
        )
        const duration = parseFlexibleTimestamp(item.duration)
        const end = endFromField ?? (duration !== null ? start + duration : start + 2)

        cues.push({
          start,
          end,
          text,
        })
      }

      return normalizeCueRange(cues)
    } catch {
      // Fall through to subtitle parsing when JSON parsing fails.
    }
  }

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

function normalizeCueRange(cues: ASRCue[]): ASRCue[] {
  if (cues.length === 0) return []
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  return sorted
    .map((cue, index) => {
      const next = sorted[index + 1]
      const safeStart = Math.max(0, cue.start)
      const fallbackEnd = next ? Math.max(next.start, safeStart + 0.5) : safeStart + 2
      const safeEnd = cue.end > safeStart ? cue.end : fallbackEnd
      return { ...cue, start: safeStart, end: safeEnd, text: cue.text.trim() }
    })
    .filter((cue) => cue.text.length > 0)
}

function extractTranscriptRows(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== 'object') return []

  const obj = json as Record<string, unknown>
  const directCandidates = ['cues', 'segments', 'items', 'results', 'entries', 'transcript']
  for (const key of directCandidates) {
    const value = obj[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>
      for (const nestedKey of directCandidates) {
        if (Array.isArray(nested[nestedKey])) {
          return nested[nestedKey] as unknown[]
        }
      }
    }
  }

  return []
}

function parseFlexibleTimestamp(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  const numeric = Number(raw)
  if (Number.isFinite(numeric)) return numeric

  const normalized = raw.replace(',', '.')
  const match = normalized.match(/^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/)
  if (match) {
    const hasHours = match[2] !== undefined
    const hours = Number(hasHours ? match[1] || 0 : 0)
    const minutes = Number(hasHours ? match[2] || 0 : match[1] || 0)
    const seconds = Number(match[3] || 0)
    const ms = Number((match[4] || '0').padEnd(3, '0'))
    return hours * 3600 + minutes * 60 + seconds + ms / 1000
  }

  const iso = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i)
  if (iso) {
    const hours = Number(iso[1] || 0)
    const minutes = Number(iso[2] || 0)
    const seconds = Number(iso[3] || 0)
    return hours * 3600 + minutes * 60 + seconds
  }

  return null
}

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

export function serializeSubtitleExport(cues: ASRCue[], format: SubtitleExportFormat): string {
  return format === 'vtt' ? cuesToVtt(cues) : cuesToSrt(cues)
}

export function getSubtitleExportMimeType(format: SubtitleExportFormat): string {
  return SUBTITLE_EXPORT_MIME_TYPES[format]
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
