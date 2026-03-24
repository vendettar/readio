// src/lib/recommended/__tests__/algorithm.test.ts
import { describe, expect, it } from 'vitest'
import {
  allGenresTried,
  buildGroup,
  buildSeenFeedsSet,
  deduplicateByFeed,
  filterCandidatesByGenre,
  filterUntriedGenres,
  getShuffledGenresForDate,
  selectNextGenres,
} from '../algorithm'
import type { RecommendedGroup, RecommendedPodcast } from '../types'

describe('recommendation algorithm - pure functions', () => {
  describe('filterUntriedGenres', () => {
    it('should filter out tried and existing genres', () => {
      const allGenres = ['tech', 'business', 'science', 'arts']
      const tried = new Set(['tech'])
      const existing = new Set(['business'])

      const result = filterUntriedGenres(allGenres, tried, existing)

      expect(result).toEqual(['science', 'arts'])
    })

    it('should return empty array if all genres tried', () => {
      const allGenres = ['tech', 'business']
      const tried = new Set<string>(['tech', 'business'])
      const existing = new Set<string>()

      const result = filterUntriedGenres(allGenres, tried, existing)

      expect(result).toEqual([])
    })
  })

  describe('buildSeenFeedsSet', () => {
    it('should build case-insensitive feed set from groups', () => {
      const groups: RecommendedGroup[] = [
        {
          id: 'tech',
          label: 'Technology',
          term: 'technology',
          items: [
            {
              id: '1',
              title: 'P1',
              author: 'A',
              artworkUrl: '',
              feedUrl: 'HTTP://FEED1.COM',
              genreNames: [],
            },
            {
              id: '2',
              title: 'P2',
              author: 'A',
              artworkUrl: '',
              feedUrl: 'http://feed2.com',
              genreNames: [],
            },
          ],
        },
      ]

      const result = buildSeenFeedsSet(groups)

      expect(result.has('http://feed1.com')).toBe(true)
      expect(result.has('http://feed2.com')).toBe(true)
      expect(result.size).toBe(2)
    })

    it('should handle empty groups', () => {
      const result = buildSeenFeedsSet([])
      expect(result.size).toBe(0)
    })
  })

  describe('filterCandidatesByGenre', () => {
    const candidates: RecommendedPodcast[] = [
      {
        id: '1',
        title: 'Tech Pod',
        author: 'A',
        artworkUrl: '',
        feedUrl: '',
        genreNames: ['Technology', 'Business'],
      },
      {
        id: '2',
        title: 'Biz Pod',
        author: 'A',
        artworkUrl: '',
        feedUrl: '',
        genreNames: ['Business'],
      },
      {
        id: '3',
        title: 'Sci Pod',
        author: 'A',
        artworkUrl: '',
        feedUrl: '',
        genreNames: ['Science'],
      },
    ]

    it('should filter by genre term (case-insensitive)', () => {
      const result = filterCandidatesByGenre(candidates, 'tech')
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('1')
    })

    it('should return empty if no matches', () => {
      const result = filterCandidatesByGenre(candidates, 'sports')
      expect(result).toEqual([])
    })

    it('should match partial genre names', () => {
      const result = filterCandidatesByGenre(candidates, 'business')
      expect(result.length).toBe(2)
    })
  })

  describe('deduplicateByFeed', () => {
    const podcasts: RecommendedPodcast[] = [
      {
        id: '1',
        title: 'P1',
        author: 'A',
        artworkUrl: '',
        feedUrl: 'http://feed1.com',
        genreNames: [],
      },
      {
        id: '2',
        title: 'P2',
        author: 'A',
        artworkUrl: '',
        feedUrl: 'HTTP://FEED1.COM',
        genreNames: [],
      }, // Duplicate
      {
        id: '3',
        title: 'P3',
        author: 'A',
        artworkUrl: '',
        feedUrl: 'http://feed2.com',
        genreNames: [],
      },
    ]

    it('should remove duplicates (case-insensitive)', () => {
      const result = deduplicateByFeed(podcasts, new Set())

      expect(result.length).toBe(2)
      expect(result[0].id).toBe('1')
      expect(result[1].id).toBe('3')
    })

    it('should respect existing seen feeds', () => {
      const seen = new Set(['http://feed1.com'])
      const result = deduplicateByFeed(podcasts, seen)

      expect(result.length).toBe(1)
      expect(result[0].id).toBe('3')
    })

    it('should handle empty input', () => {
      const result = deduplicateByFeed([], new Set())
      expect(result).toEqual([])
    })
  })

  describe('getShuffledGenresForDate', () => {
    const pool: RecommendedPodcast[] = [
      {
        id: '1',
        title: 'P1',
        author: 'A',
        artworkUrl: '',
        feedUrl: '',
        genreNames: ['Technology', 'Business'],
      },
      {
        id: '2',
        title: 'P2',
        author: 'A',
        artworkUrl: '',
        feedUrl: '',
        genreNames: ['Science', 'Technology'],
      },
      { id: '3', title: 'P3', author: 'A', artworkUrl: '', feedUrl: '', genreNames: ['Arts'] },
    ]

    it('should return stable shuffle with same seed', () => {
      const result1 = getShuffledGenresForDate(pool, 20250101)
      const result2 = getShuffledGenresForDate(pool, 20250101)

      expect(result1).toEqual(result2)
    })

    it('should return different shuffle with different seed', () => {
      const result1 = getShuffledGenresForDate(pool, 20250101)
      const result2 = getShuffledGenresForDate(pool, 20250102)

      expect(result1).not.toEqual(result2)
    })

    it('should limit to top 20 genres', () => {
      const largePool: RecommendedPodcast[] = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`,
        title: `P${i}`,
        author: 'A',
        artworkUrl: '',
        feedUrl: '',
        genreNames: [`Genre${i}`],
      }))

      const result = getShuffledGenresForDate(largePool, 20250101)

      expect(result.length).toBeLessThanOrEqual(20)
    })
  })

  describe('buildGroup', () => {
    it('should build group with category info', () => {
      const podcasts: RecommendedPodcast[] = [
        { id: '1', title: 'P1', author: 'A', artworkUrl: '', feedUrl: '', genreNames: [] },
      ]

      const result = buildGroup('technology', podcasts)

      expect(result.id).toBe('technology')
      expect(result.label).toBe('Technology')
      expect(result.term).toBe('technology')
      expect(result.items).toEqual(podcasts)
    })
  })

  describe('allGenresTried', () => {
    it('should return true if all genres tried', () => {
      const genres = ['tech', 'business', 'science']
      const tried = new Set(['tech', 'business', 'science'])

      expect(allGenresTried(genres, tried)).toBe(true)
    })

    it('should return false if some genres not tried', () => {
      const genres = ['tech', 'business', 'science']
      const tried = new Set(['tech', 'business'])

      expect(allGenresTried(genres, tried)).toBe(false)
    })

    it('should handle empty genres', () => {
      expect(allGenresTried([], new Set())).toBe(true)
    })
  })

  describe('selectNextGenres', () => {
    const shuffledGenres = ['tech', 'business', 'science', 'arts', 'health']

    it('should select requested number of untried genres', () => {
      const result = selectNextGenres({
        shuffledGenres,
        triedCategoryIds: new Set(['tech']),
        existingGroupIds: new Set(),
        desiredCount: 2,
      })

      expect(result.selectedIds.length).toBe(2)
      expect(result.selectedIds).toEqual(['business', 'science'])
      expect(result.hasMore).toBe(true)
    })

    it('should exclude existing groups', () => {
      const result = selectNextGenres({
        shuffledGenres,
        triedCategoryIds: new Set(),
        existingGroupIds: new Set(['tech', 'business']),
        desiredCount: 2,
      })

      expect(result.selectedIds).toEqual(['science', 'arts'])
    })

    it('should mark hasMore as false when all tried', () => {
      const result = selectNextGenres({
        shuffledGenres: ['tech', 'business'],
        triedCategoryIds: new Set(['tech', 'business']),
        existingGroupIds: new Set(),
        desiredCount: 1,
      })

      expect(result.selectedIds).toEqual([])
      expect(result.hasMore).toBe(false)
    })

    it('should handle requesting more than available', () => {
      const result = selectNextGenres({
        shuffledGenres: ['tech', 'business'],
        triedCategoryIds: new Set(),
        existingGroupIds: new Set(),
        desiredCount: 10,
      })

      expect(result.selectedIds.length).toBe(2)
      expect(result.selectedIds).toEqual(['tech', 'business'])
    })
  })
})
