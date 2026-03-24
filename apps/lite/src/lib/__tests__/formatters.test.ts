// src/lib/__tests__/formatters.test.ts
import { describe, expect, it, vi } from 'vitest'
import {
  formatCompactNumber,
  formatDateStandard,
  formatFileSize,
  formatFileSizeStructured,
  formatNumber,
  formatTimeLabel,
  formatTimeSmart,
  formatTimestamp,
} from '../formatters'
import { formatRelativeTime } from '../relativeTime'

describe('formatters - pure functions', () => {
  describe('formatFileSizeStructured', () => {
    it('returns structured data for bytes', () => {
      const result = formatFileSizeStructured(500)
      expect(result.value).toBe(500)
      expect(result.unit).toBe('B')
      expect(result.formatted).toContain('500')
    })

    it('returns structured data for kilobytes', () => {
      const result = formatFileSizeStructured(1536) // 1.5 KB
      expect(result.value).toBe(1.5)
      expect(result.unit).toBe('KB')
    })

    it('returns structured data for megabytes', () => {
      const result = formatFileSizeStructured(1.5 * 1024 * 1024)
      expect(result.value).toBe(1.5)
      expect(result.unit).toBe('MB')
    })

    it('handles zero bytes', () => {
      const result = formatFileSizeStructured(0)
      expect(result.value).toBe(0)
      expect(result.unit).toBe('B')
      expect(result.formatted).toMatch(/0\s?B/)
    })

    it('handles negative bytes', () => {
      const result = formatFileSizeStructured(-100)
      expect(result.value).toBe(0)
      expect(result.unit).toBe('B')
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0, 'en')).toMatch(/0\s?B/i)
      expect(formatFileSize(500, 'en')).toMatch(/500\s?B/i)
      expect(formatFileSize(1023, 'en')).toMatch(/1[,\s]?023\s?B/i)
    })

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024, 'en')).toMatch(/^1(\.|,)?0?\s?kB/i)
      expect(formatFileSize(1536, 'en')).toMatch(/^1(\.|,)?5\s?kB/i)
      expect(formatFileSize(1024 * 1023, 'en')).toMatch(/^1[,\s]?023(\.|,)?0?\s?kB/i)
    })

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024, 'en')).toMatch(/^1(\.|,)?0?\s?MB/i)
      expect(formatFileSize(1024 * 1024 * 2.5, 'en')).toMatch(/^2(\.|,)?5\s?MB/i)
      expect(formatFileSize(1024 * 1024 * 100, 'en')).toMatch(/^100(\.|,)?0?\s?MB/i)
    })

    it('should handle edge cases', () => {
      expect(formatFileSize(-100, 'en')).toMatch(/0\s?B/i)
      expect(formatFileSize(NaN, 'en')).toMatch(/0\s?B/i)
      expect(formatFileSize(Infinity, 'en')).toMatch(/0\s?B/i)
    })
  })

  describe('formatTimestamp', () => {
    it('should format valid timestamps', () => {
      const result = formatTimestamp(1640000000000, 'en-US') // 2021-12-20
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/20/)
    })

    it('should handle invalid timestamps', () => {
      expect(formatTimestamp(0)).toBe('')
      expect(formatTimestamp(-1)).toBe('')
      expect(formatTimestamp(NaN)).toBe('')
      expect(formatTimestamp(Infinity)).toBe('')
    })

    it('should respect locale parameter', () => {
      const timestamp = 1640000000000
      const enResult = formatTimestamp(timestamp, 'en-US')
      const result = formatTimestamp(timestamp)
      expect(typeof enResult).toBe('string')
      expect(typeof result).toBe('string')
    })
  })

  describe('formatTimeLabel', () => {
    it('should format seconds correctly', () => {
      expect(formatTimeLabel(0)).toBe('0:00')
      expect(formatTimeLabel(30)).toBe('0:30')
      expect(formatTimeLabel(59)).toBe('0:59')
    })

    it('should format minutes correctly', () => {
      expect(formatTimeLabel(60)).toBe('1:00')
      expect(formatTimeLabel(90)).toBe('1:30')
      expect(formatTimeLabel(3599)).toBe('59:59')
    })

    it('should format hours correctly', () => {
      expect(formatTimeLabel(3600)).toBe('60:00')
      expect(formatTimeLabel(3661)).toBe('61:01')
      expect(formatTimeLabel(7200)).toBe('120:00')
    })

    it('should handle edge cases', () => {
      expect(formatTimeLabel(NaN)).toBe('0:00')
      expect(formatTimeLabel(-10)).toBe('0:00')
      expect(formatTimeLabel(Infinity)).toBe('0:00')
    })

    it('should pad seconds with zero', () => {
      expect(formatTimeLabel(65)).toBe('1:05')
      expect(formatTimeLabel(3605)).toBe('60:05')
    })
  })

  describe('formatNumber', () => {
    it('should format numbers with separators', () => {
      expect(formatNumber(1000)).toMatch(/1[,\s]000/)
      expect(formatNumber(1000000)).toMatch(/1[,\s]000[,\s]000/)
    })

    it('should handle edge cases', () => {
      expect(formatNumber(0)).toBe('0')
      expect(formatNumber(NaN)).toBe('0')
      expect(formatNumber(Infinity)).toBe('0')
    })

    it('should handle negative numbers', () => {
      const result = formatNumber(-1000)
      expect(result).toMatch(/-1[,\s]000/)
    })
  })

  describe('Intl formatters', () => {
    it('formats relative time in en/de', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
        const now = Date.now()
        const fiveMinutesAgo = now - 5 * 60 * 1000

        const enExpected = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
          -5,
          'minute'
        )
        const deExpected = new Intl.RelativeTimeFormat('de', { numeric: 'auto' }).format(
          -5,
          'minute'
        )

        expect(formatRelativeTime(fiveMinutesAgo, 'en')).toBe(enExpected)
        expect(formatRelativeTime(fiveMinutesAgo, 'de')).toBe(deExpected)
      } finally {
        vi.useRealTimers()
      }
    })

    it('formats date/time in en/de', () => {
      const timestamp = Date.UTC(2021, 11, 20, 13, 5, 0)
      const date = new Date(timestamp)

      const enDateExpected = new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
      const deDateExpected = new Intl.DateTimeFormat('de', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)

      expect(formatDateStandard(timestamp, 'en')).toBe(enDateExpected)
      expect(formatDateStandard(timestamp, 'de')).toBe(deDateExpected)

      const systemHour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
        .hour12
      const enTimeExpected = new Intl.DateTimeFormat('en', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: Boolean(systemHour12),
      }).format(date)
      const deTimeExpected = new Intl.DateTimeFormat('de', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: Boolean(systemHour12),
      }).format(date)

      expect(formatTimeSmart(timestamp, 'en')).toBe(enTimeExpected)
      expect(formatTimeSmart(timestamp, 'de')).toBe(deTimeExpected)
    })

    it('formats compact numbers in en/de', () => {
      const value = 1200
      const enExpected = new Intl.NumberFormat('en', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      }).format(value)
      const deExpected = new Intl.NumberFormat('de', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      }).format(value)

      expect(formatCompactNumber(value, 'en')).toBe(enExpected)
      expect(formatCompactNumber(value, 'de')).toBe(deExpected)
    })
  })
})
