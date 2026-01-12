// src/libs/recommended/__tests__/batch.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRecommendedCandidates, loadRecommendedBatch } from '../batch'
import * as sources from '../sources'
import type { RecommendedGroup } from '../types'
import * as validator from '../validator'

// Mock dependencies
vi.mock('../sources')
vi.mock('../validator')

describe('loadRecommendedBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return allLoaded:true when pool is empty', async () => {
    vi.spyOn(sources, 'fetchTopPodcastsFromSource').mockResolvedValue([])

    const result = await loadRecommendedBatch('us', 'en', [], new Set())

    expect(result.allLoaded).toBe(true)
    expect(result.groups).toEqual([])
  })

  it('should handle AbortError gracefully', async () => {
    const mockAbort = new AbortController()
    mockAbort.abort()

    const mockPool = [
      {
        id: '1',
        title: 'Test Podcast',
        author: 'Test Author',
        artworkUrl: 'http://test.com/art.jpg',
        feedUrl: 'http://test.com/feed.xml',
        genreNames: ['Technology'],
      },
    ]

    vi.spyOn(sources, 'fetchTopPodcastsFromSource').mockResolvedValue(mockPool)

    const result = await loadRecommendedBatch('us', 'en', [], new Set(), {
      signal: mockAbort.signal,
    })

    // Should stop early but not crash
    expect(result.groups.length).toBeLessThanOrEqual(1)
  })

  it('should deduplicate seen feeds', async () => {
    const feedUrl = 'http://test.com/feed.xml'
    const existingGroup: RecommendedGroup = {
      id: 'tech',
      label: 'Technology',
      term: 'technology',
      items: [
        {
          id: '1',
          title: 'Existing Podcast',
          author: 'Author',
          artworkUrl: 'http://test.com/art1.jpg',
          feedUrl,
          genreNames: ['Technology'],
        },
      ],
    }

    const mockPool = [
      {
        id: '2',
        title: 'Same Feed Podcast',
        author: 'Author 2',
        artworkUrl: 'http://test.com/art2.jpg',
        feedUrl, // Same feed
        genreNames: ['Technology'],
      },
    ]

    vi.spyOn(sources, 'fetchTopPodcastsFromSource').mockResolvedValue(mockPool)

    const result = await loadRecommendedBatch('us', 'en', [existingGroup], new Set())

    // Should not add duplicate feeds
    const allFeeds = result.groups.flatMap((g) => g.items.map((i) => i.feedUrl))
    const uniqueFeeds = new Set(allFeeds)
    expect(allFeeds.length).toBe(uniqueFeeds.size)
  })

  it('should respect desiredGroups limit', async () => {
    const mockPool = Array.from({ length: 50 }, (_, i) => ({
      id: `${i}`,
      title: `Podcast ${i}`,
      author: 'Author',
      artworkUrl: 'http://test.com/art.jpg',
      feedUrl: `http://test.com/feed${i}.xml`,
      genreNames: ['Technology', 'Business', 'Science'],
    }))

    vi.spyOn(sources, 'fetchTopPodcastsFromSource').mockResolvedValue(mockPool)
    vi.spyOn(validator, 'pickCorsAllowedRecommended').mockResolvedValue([mockPool[0]])

    const result = await loadRecommendedBatch('us', 'en', [], new Set(), { desiredGroups: 2 })

    expect(result.groups.length).toBeLessThanOrEqual(2)
  }, 10000)

  it('should mark allLoaded when all categories tried', async () => {
    const mockPool = [
      {
        id: '1',
        title: 'Test Podcast',
        author: 'Author',
        artworkUrl: 'http://test.com/art.jpg',
        feedUrl: 'http://test.com/feed.xml',
        genreNames: ['Technology'],
      },
    ]

    vi.spyOn(sources, 'fetchTopPodcastsFromSource').mockResolvedValue(mockPool)
    vi.spyOn(validator, 'pickCorsAllowedRecommended').mockResolvedValue([mockPool[0]])

    const triedCategories = new Set<string>()
    let result = await loadRecommendedBatch('us', 'en', [], triedCategories)

    // Keep loading until all loaded
    let iterations = 0
    while (!result.allLoaded && iterations < 25) {
      result = await loadRecommendedBatch('us', 'en', result.groups, triedCategories)
      iterations++
    }

    expect(result.allLoaded).toBe(true)
  }, 10000)
})

describe('fetchRecommendedCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty array when pool is empty', async () => {
    vi.spyOn(sources, 'fetchTopPodcastsFromSource').mockResolvedValue([])

    const result = await fetchRecommendedCandidates('technology', 'us')

    expect(result).toEqual([])
  })

  it('should filter podcasts by genre', async () => {
    const mockPool = [
      {
        id: '1',
        title: 'Tech Podcast',
        author: 'Author',
        artworkUrl: 'http://test.com/art1.jpg',
        feedUrl: 'http://test.com/feed1.xml',
        genreNames: ['Technology'],
      },
      {
        id: '2',
        title: 'Business Podcast',
        author: 'Author',
        artworkUrl: 'http://test.com/art2.jpg',
        feedUrl: 'http://test.com/feed2.xml',
        genreNames: ['Business'],
      },
    ]

    vi.spyOn(sources, 'fetchTopPodcastsFromSource').mockResolvedValue(mockPool)

    const result = await fetchRecommendedCandidates('technology', 'us')

    // Should only include technology podcasts
    expect(result.every((p) => p.genreNames.some((g) => g.toLowerCase().includes('tech')))).toBe(
      true
    )
  })

  it('should handle abort signal', async () => {
    const abortController = new AbortController()
    abortController.abort()

    vi.spyOn(sources, 'fetchTopPodcastsFromSource').mockRejectedValue(
      new DOMException('Aborted', 'AbortError')
    )

    await expect(
      fetchRecommendedCandidates('technology', 'us', abortController.signal)
    ).rejects.toThrow('Aborted')
  })
})
