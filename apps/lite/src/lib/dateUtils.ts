// src/lib/dateUtils.ts
// Date formatting utilities

/**
 * Format a date as relative time (e.g., "3D AGO", "2H AGO")
 * Matches premium podcast styles. Supports i18n via translation function.
 */
export function formatRelativeTime(
  dateStr: string,
  t: (key: string, options?: Record<string, string | number>) => string
): string {
  if (!dateStr) return ''

  const date = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  // If 6 days or more, show as YYYY/MM/DD (Standard format)
  if (dayDiff >= 6) {
    return formatDateStandard(date.getTime())
  }

  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (dayDiff > 0) {
    return t('dateDaysAgo', { count: dayDiff }).toUpperCase()
  }
  if (diffHour > 0) {
    return t('dateHoursAgo', { count: diffHour }).toUpperCase()
  }
  if (diffMin > 0) {
    return t('dateMinutesAgo', { count: diffMin }).toUpperCase()
  }
  return t('dateJustNow').toUpperCase()
}

/**
 * Format duration in seconds to a condensed format
 * Uses Math.round to match common industry "nearest minute" display
 */
export function formatDuration(
  seconds: number | undefined,
  t: (key: string, options?: Record<string, string | number>) => string
): string {
  if (!seconds) return ''

  const totalMinutes = Math.round(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  if (h > 0) {
    if (m > 0) {
      return t('durationHoursMinutesShort', { h, m })
    }
    return t('durationHoursShort', { h })
  }
  return t('durationMinutesShort', { m })
}
/**
 * Format timestamp to standard date format (YYYY/MM/DD)
 */
export function formatDateStandard(timestamp: number | string | undefined): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

/**
 * Format timestamp to a smart time string (respects system 12/24h preference)
 */
export function formatTimeSmart(timestamp: number | string | Date, language: string): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''

  // Detect system 12/24 hour preference
  const systemHour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
    .hour12

  return d.toLocaleTimeString(language, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: systemHour12,
  })
}
