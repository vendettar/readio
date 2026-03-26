// src/lib/dateUtils.ts
// Date formatting utilities
import type { TFunction } from 'i18next'
import {
  formatDateStandard as formatDateStandardIntl,
  formatTimeSmart as formatTimeSmartIntl,
} from './formatters'
import i18n from './i18n'
import { formatRelativeTime as formatRelativeTimeIntl } from './relativeTime'

const resolveLocale = (locale?: string) => locale ?? i18n.resolvedLanguage ?? i18n.language ?? 'en'

/**
 * Format a date as relative time (e.g., "3D AGO", "2H AGO")
 * Matches premium podcast styles. Uses Intl.RelativeTimeFormat.
 */
export function formatRelativeTime(dateStr: string, locale?: string): string {
  if (!dateStr) return ''

  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const startOfDayNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDayDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.floor(
    (startOfDayNow.getTime() - startOfDayDate.getTime()) / (24 * 60 * 60 * 1000)
  )

  // If 6 days or more, show as standard date format
  if (dayDiff >= 6) {
    return formatDateStandardIntl(date.getTime(), resolveLocale(locale))
  }

  const relative = formatRelativeTimeIntl(date.getTime(), resolveLocale(locale))
  return relative ? relative.toUpperCase() : ''
}

/**
 * Format duration in seconds to a condensed format
 * Uses Math.round to match common industry "nearest minute" display
 */
export function formatDuration(seconds: number | undefined, t: TFunction): string {
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
export function formatDateStandard(
  timestamp: number | string | undefined,
  locale?: string
): string {
  return formatDateStandardIntl(timestamp, resolveLocale(locale))
}

/**
 * Format timestamp to a smart time string (respects system 12/24h preference)
 */
export function formatTimeSmart(timestamp: number | string | Date, language: string): string {
  return formatTimeSmartIntl(timestamp, resolveLocale(language))
}

/**
 * Format timestamp for filesystem-safe date suffixes in UTC (YYYY-MM-DD).
 */
export function formatDateForFilenameUTC(timestamp: number | string | Date): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return '1970-01-01'
  }
  return date.toISOString().slice(0, 10)
}
