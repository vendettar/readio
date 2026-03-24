import { describe, expect, it } from 'vitest'
import { generateSlug, generateSlugWithId, parseSlugWithId, toShortId8Token } from '../slugUtils'

describe('slugUtils', () => {
  describe('generateSlug', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      expect(generateSlug('The Daily News')).toBe('the-daily-news')
    })

    it('removes non-alphanumeric characters', () => {
      expect(generateSlug("What's Up? (Episode #12)")).toBe('what-s-up-episode-12')
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

  describe('generateSlugWithId', () => {
    it('generates slug with 8-char short ID suffix', () => {
      expect(generateSlugWithId('The Daily News', '72507613-548d-4f8c-a2f2-b3de016846bb')).toBe(
        'the-daily-news-72507613'
      )
    })

    it('uses fallback title for empty title', () => {
      expect(generateSlugWithId('', 'ABCDEF12-3456')).toBe('episode-abcdef12')
    })

    it('lowercases short ID', () => {
      expect(generateSlugWithId('Test', 'AABB0011-rest')).toBe('test-aabb0011')
    })

    it('pads short source IDs deterministically to 8 chars', () => {
      expect(generateSlugWithId('Tiny', 'abc')).toMatch(/^tiny-[a-z0-9]{8}$/)
      expect(generateSlugWithId('Tiny', 'abc')).toBe(generateSlugWithId('Tiny', 'abc'))
    })
  })

  describe('parseSlugWithId', () => {
    it('parses valid slug into title and short ID', () => {
      expect(parseSlugWithId('the-daily-news-72507613')).toEqual({
        titleSlug: 'the-daily-news',
        shortId: '72507613',
      })
    })

    it('handles single-word title slug', () => {
      expect(parseSlugWithId('episode-abcdef12')).toEqual({
        titleSlug: 'episode',
        shortId: 'abcdef12',
      })
    })

    it('returns null for empty string', () => {
      expect(parseSlugWithId('')).toBeNull()
    })

    it('returns null for no hyphen', () => {
      expect(parseSlugWithId('nohyphens')).toBeNull()
    })

    it('rejects IDs that are not exactly 8 chars', () => {
      expect(parseSlugWithId('test-abc')).toBeNull()
      expect(parseSlugWithId('test-abcdefghi')).toBeNull()
    })

    it('returns null for short ID with invalid characters', () => {
      expect(parseSlugWithId('test-ABCD_EFG')).toBeNull()
    })

    it('returns fallback title slug when title segment is empty', () => {
      expect(parseSlugWithId('-abcdef12')).toEqual({
        titleSlug: 'episode',
        shortId: 'abcdef12',
      })
    })

    it('round-trips with generateSlugWithId', () => {
      const slug = generateSlugWithId('Interview with Obama', '766f112e-abcd-1234')
      const parsed = parseSlugWithId(slug)
      expect(parsed).not.toBeNull()
      expect(parsed?.shortId).toBe('766f112e')
      expect(parsed?.titleSlug).toBe('interview-with-obama')
    })
  })

  describe('toShortId8Token', () => {
    it('returns exact first 8 chars for long IDs', () => {
      expect(toShortId8Token('abcdef12345')).toBe('abcdef12')
    })

    it('pads short IDs with deterministic hash content', () => {
      const token = toShortId8Token('a1')
      expect(token).toMatch(/^[a-z0-9]{8}$/)
      expect(token).toBe(toShortId8Token('a1'))
    })
  })
})
