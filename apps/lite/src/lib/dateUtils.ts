// src/lib/dateUtils.ts
// Date formatting utilities
import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  format,
  startOfDay,
} from 'date-fns'
import type { TFunction } from 'i18next'

/**
 * Format a date as relative time (e.g., "3D AGO", "2H AGO")
 * Matches premium podcast styles. Supports i18n via translation function.
 */
export function formatRelativeTime(dateStr: string, t: TFunction): string {
  if (!dateStr) return ''

  const date = new Date(dateStr)
  const now = new Date()

  const dayDiff = differenceInDays(startOfDay(now), startOfDay(date))

  // If 6 days or more, show as YYYY/MM/DD (Standard format)
  if (dayDiff >= 6) {
    return formatDateStandard(date.getTime())
  }

  if (dayDiff > 0) {
    return t('dateDaysAgo', { count: dayDiff }).toUpperCase()
  }

  const diffHour = differenceInHours(now, date)
  if (diffHour > 0) {
    return t('dateHoursAgo', { count: diffHour }).toUpperCase()
  }

  const diffMin = differenceInMinutes(now, date)
  if (diffMin > 0) {
    return t('dateMinutesAgo', { count: diffMin }).toUpperCase()
  }

  return t('dateJustNow').toUpperCase()
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
export function formatDateStandard(timestamp: number | string | undefined): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  return format(date, 'yyyy/MM/dd')
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
