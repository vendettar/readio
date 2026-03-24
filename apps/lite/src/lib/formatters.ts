// src/lib/formatters.ts
// Pure formatting utilities - fully testable without dependencies
import i18n from './i18n'

const resolveLocale = (locale?: string) => locale ?? i18n.resolvedLanguage ?? i18n.language ?? 'en'

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()
const dateStandardFormatters = new Map<string, Intl.DateTimeFormat>()
const dateShortFormatters = new Map<string, Intl.DateTimeFormat>()
const dateShortWithYearFormatters = new Map<string, Intl.DateTimeFormat>()
const timeSmartFormatters = new Map<string, Intl.DateTimeFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()
const compactNumberFormatters = new Map<string, Intl.NumberFormat>()

const getDateTimeFormatter = (locale: string) => {
  const cached = dateTimeFormatters.get(locale)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  dateTimeFormatters.set(locale, formatter)
  return formatter
}

const getDateStandardFormatter = (locale: string) => {
  const cached = dateStandardFormatters.get(locale)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  dateStandardFormatters.set(locale, formatter)
  return formatter
}

const getDateShortFormatter = (locale: string, includeYear: boolean) => {
  const cache = includeYear ? dateShortWithYearFormatters : dateShortFormatters
  const cached = cache.get(locale)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: includeYear ? 'numeric' : undefined,
  })
  cache.set(locale, formatter)
  return formatter
}

const getTimeSmartFormatter = (locale: string, hour12: boolean) => {
  const key = `${locale}:${hour12 ? '12' : '24'}`
  const cached = timeSmartFormatters.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  })
  timeSmartFormatters.set(key, formatter)
  return formatter
}

const getNumberFormatter = (locale: string) => {
  const cached = numberFormatters.get(locale)
  if (cached) return cached
  const formatter = new Intl.NumberFormat(locale)
  numberFormatters.set(locale, formatter)
  return formatter
}

const getCompactNumberFormatter = (locale: string) => {
  const cached = compactNumberFormatters.get(locale)
  if (cached) return cached
  const formatter = new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })
  compactNumberFormatters.set(locale, formatter)
  return formatter
}

/**
 * Structured file size representation
 */
export interface FormattedFileSize {
  /** Numeric value (e.g., 1.5) */
  value: number
  /** Unit string (e.g., "MB", "GB") */
  unit: string
  /** Full formatted string for display (e.g., "1.5 MB") - locale-aware */
  formatted: string
}

/**
 * Format bytes to structured file size with separated value and unit.
 * Use this when you need programmatic access to the numeric value.
 */
export function formatFileSizeStructured(bytes: number, locale?: string): FormattedFileSize {
  const safeBytes = Math.max(0, Number.isFinite(bytes) ? bytes : 0)

  const thresholds = [
    { unit: 'B', intlUnit: 'byte', value: 1 },
    { unit: 'KB', intlUnit: 'kilobyte', value: 1024 },
    { unit: 'MB', intlUnit: 'megabyte', value: 1024 * 1024 },
    { unit: 'GB', intlUnit: 'gigabyte', value: 1024 * 1024 * 1024 },
  ] as const

  const picked = thresholds.reduce(
    (acc, curr) => (safeBytes >= curr.value ? curr : acc),
    thresholds[0]
  )

  const numericValue = safeBytes / picked.value
  // Round to 1 decimal place for consistency
  const roundedValue = Math.round(numericValue * 10) / 10

  const formatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: picked.intlUnit,
    unitDisplay: 'narrow',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })

  return {
    value: roundedValue,
    unit: picked.unit,
    formatted: formatter.format(numericValue),
  }
}

/**
 * Format file size in bytes to human-readable string (localized units)
 */
export function formatFileSize(bytes: number, locale?: string): string {
  const safeBytes = Math.max(0, Number.isFinite(bytes) ? bytes : 0)

  const thresholds = [
    { unit: 'byte', value: 1 },
    { unit: 'kilobyte', value: 1024 },
    { unit: 'megabyte', value: 1024 * 1024 },
    { unit: 'gigabyte', value: 1024 * 1024 * 1024 },
  ] as const

  const picked = thresholds.reduce(
    (acc, curr) => (safeBytes >= curr.value ? curr : acc),
    thresholds[0]
  )
  const formatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: picked.unit,
    unitDisplay: 'narrow',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })

  const value = safeBytes / picked.value
  return formatter.format(value)
}

/**
 * Format timestamp to human-readable date string
 */
export function formatTimestamp(timestamp: number, locale?: string): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const formatter = getDateTimeFormatter(resolveLocale(locale))
  return formatter.format(date)
}

/**
 * Format timestamp to standard date format (locale-aware)
 */
export function formatDateStandard(
  timestamp: number | string | undefined,
  locale?: string
): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const formatter = getDateStandardFormatter(resolveLocale(locale))
  return formatter.format(date)
}

/**
 * Format date with short month/day (optional year)
 */
export function formatDateShort(
  timestamp: number | string | Date,
  locale?: string,
  includeYear = false
): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const formatter = getDateShortFormatter(resolveLocale(locale), includeYear)
  return formatter.format(date)
}

/**
 * Format timestamp to a smart time string (respects system 12/24h preference)
 */
export function formatTimeSmart(timestamp: number | string | Date, locale?: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const systemHour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
    .hour12
  const formatter = getTimeSmartFormatter(resolveLocale(locale), Boolean(systemHour12))
  return formatter.format(date)
}

/**
 * Format time in seconds to M:SS format (for playback time labels)
 */
export function formatTimeLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'

  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format number with thousand separators
 */
export function formatNumber(num: number, locale?: string): string {
  if (!Number.isFinite(num)) return '0'
  const formatter = getNumberFormatter(resolveLocale(locale))
  return formatter.format(num)
}

/**
 * Format bytes (alias for formatFileSize for convenience)
 */
export const formatBytes = formatFileSize

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(decimals)}%`
}
/**
 * Format large numbers to compact string (e.g. 1500 -> "1.5K")
 */
export function formatCompactNumber(num: number, locale?: string): string {
  if (!Number.isFinite(num) || num <= 0) return '0'
  const formatter = getCompactNumberFormatter(resolveLocale(locale))
  return formatter.format(num)
}
