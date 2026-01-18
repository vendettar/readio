// src/lib/__tests__/formatters.test.ts
import { describe, expect, it } from 'vitest'
import { formatFileSize, formatNumber, formatTimeLabel, formatTimestamp } from '../formatters'

describe('formatters - pure functions', () => {
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
})
