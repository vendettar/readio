// src/lib/recommended/__tests__/validator.test.ts
import { describe, expect, it } from 'vitest'
import { matchesGenreTokens } from '../validator'

describe('validator - pure functions', () => {
  describe('matchesGenreTokens', () => {
    it('should match single token', () => {
      expect(matchesGenreTokens(['Technology', 'Business'], 'tech')).toBe(true)
      expect(matchesGenreTokens(['Science', 'History'], 'science')).toBe(true)
    })

    it('should match multiple tokens (any match)', () => {
      expect(matchesGenreTokens(['Technology'], 'tech business')).toBe(true)
      expect(matchesGenreTokens(['Business'], 'tech business')).toBe(true)
    })

    it('should be case-insensitive', () => {
      expect(matchesGenreTokens(['TECHNOLOGY'], 'technology')).toBe(true)
      expect(matchesGenreTokens(['technology'], 'TECHNOLOGY')).toBe(true)
      expect(matchesGenreTokens(['TeCh'], 'tEcH')).toBe(true)
    })

    it('should handle partial matches', () => {
      expect(matchesGenreTokens(['Technology'], 'tech')).toBe(true)
      expect(matchesGenreTokens(['Business'], 'busi')).toBe(true)
    })

    it('should not match if no tokens match', () => {
      expect(matchesGenreTokens(['Technology'], 'sports')).toBe(false)
      expect(matchesGenreTokens(['Business', 'Finance'], 'health')).toBe(false)
    })

    it('should handle empty term (matches all)', () => {
      expect(matchesGenreTokens(['Technology'], '')).toBe(true)
      expect(matchesGenreTokens(['Business'], '')).toBe(true)
    })

    it('should handle empty genres array', () => {
      expect(matchesGenreTokens([], 'technology')).toBe(false)
      expect(matchesGenreTokens([], '')).toBe(true)
    })

    it('should handle multiple genres', () => {
      const genres = ['Technology', 'Business', 'Science']
      expect(matchesGenreTokens(genres, 'tech')).toBe(true)
      expect(matchesGenreTokens(genres, 'business')).toBe(true)
      expect(matchesGenreTokens(genres, 'science')).toBe(true)
      expect(matchesGenreTokens(genres, 'sports')).toBe(false)
    })

    it('should handle whitespace in term', () => {
      expect(matchesGenreTokens(['Technology'], '  tech  ')).toBe(true)
      expect(matchesGenreTokens(['Business'], 'tech   business')).toBe(true)
    })

    it('should handle special characters', () => {
      expect(matchesGenreTokens(['TV & Film'], 'tv')).toBe(true)
      expect(matchesGenreTokens(['Arts & Culture'], 'arts')).toBe(true)
    })

    it('should handle hyphenated genres', () => {
      expect(matchesGenreTokens(['Self-Help'], 'self')).toBe(true)
      expect(matchesGenreTokens(['Sci-Fi'], 'sci')).toBe(true)
    })
  })
})
