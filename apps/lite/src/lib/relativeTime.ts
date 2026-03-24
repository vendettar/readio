// src/lib/relativeTime.ts
// Tiny helper for formatting relative time strings
import i18n from './i18n'

const resolveLocale = (locale?: string) => locale ?? i18n.resolvedLanguage ?? i18n.language ?? 'en'

const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>()

const getRelativeTimeFormatter = (locale: string) => {
  const cached = relativeTimeFormatters.get(locale)
  if (cached) return cached
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  relativeTimeFormatters.set(locale, formatter)
  return formatter
}

/**
 * Format a timestamp as a relative time string (e.g., "2 days ago")
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time string
 */
export function formatRelativeTime(timestamp: number, locale?: string): string {
  if (!Number.isFinite(timestamp)) return ''

  const now = Date.now()
  const diffSeconds = Math.round((timestamp - now) / 1000)
  const absSeconds = Math.abs(diffSeconds)

  let value = diffSeconds
  let unit: Intl.RelativeTimeFormatUnit = 'second'

  if (absSeconds < 60) {
    value = diffSeconds
    unit = 'second'
  } else if (absSeconds < 60 * 60) {
    value = Math.round(diffSeconds / 60)
    unit = 'minute'
  } else if (absSeconds < 60 * 60 * 24) {
    value = Math.round(diffSeconds / (60 * 60))
    unit = 'hour'
  } else if (absSeconds < 60 * 60 * 24 * 7) {
    value = Math.round(diffSeconds / (60 * 60 * 24))
    unit = 'day'
  } else if (absSeconds < 60 * 60 * 24 * 30) {
    value = Math.round(diffSeconds / (60 * 60 * 24 * 7))
    unit = 'week'
  } else {
    value = Math.round(diffSeconds / (60 * 60 * 24 * 30))
    unit = 'month'
  }

  const formatter = getRelativeTimeFormatter(resolveLocale(locale))
  return formatter.format(value, unit)
}
