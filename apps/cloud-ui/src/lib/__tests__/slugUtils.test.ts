import { describe, expect, it } from 'vitest'
import { generateSlug } from '../slugUtils'

describe('slugUtils', () => {
  describe('generateSlug', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      expect(generateSlug('The Daily News')).toBe('the-daily-news')
    })

    it('removes non-alphanumeric characters', () => {
      expect(generateSlug("What's Up? (Episode #12)")).toBe('whats-up-episode-12')
    })

    it('collapses repeated hyphens', () => {
      expect(generateSlug('hello---world')).toBe('hello-world')
    })

    it('trims leading and trailing hyphens', () => {
      expect(generateSlug('--hello--')).toBe('hello')
    })

    it('returns fallback for empty string', () => {
      expect(generateSlug('')).toBe('episode')
    })

    it('returns fallback for non-alphanumeric-only input', () => {
      expect(generateSlug('!@#$%')).toBe('episode')
    })

    it('handles unicode by stripping non-ascii', () => {
      expect(generateSlug('日本語テスト')).toBe('episode')
    })

    it('handles mixed unicode and ascii', () => {
      expect(generateSlug('日本語 Episode 5')).toBe('episode-5')
    })
  })
})
