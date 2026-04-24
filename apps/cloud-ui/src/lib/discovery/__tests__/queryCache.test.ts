import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../../__tests__/queryClient'
import discovery from '../index'
import { PODCAST_DEFAULT_FEED_QUERY_LIMIT } from '../podcastQueryContract'
import { ensurePodcastDetail, ensurePodcastFeed } from '../queryCache'

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>()
  return {
    ...actual,
    default: {
      ...actual.default,
      getPodcastIndexPodcastByItunesId: vi.fn(),
      fetchPodcastFeed: vi.fn(),
    },
  }
})

describe('discovery query cache helpers', () => {
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    queryClient = createTestQueryClient()
    vi.clearAllMocks()
  })

  it('reuses cached podcast detail across imperative callers', async () => {
    vi.mocked(discovery.getPodcastIndexPodcastByItunesId).mockResolvedValue({
      podcastItunesId: '123',
      title: 'Podcast',
      author: 'Host',
      artwork: 'https://example.com/art.jpg',
      description: 'desc',
      feedUrl: 'https://example.com/feed.xml',
      lastUpdateTime: 1,
      episodeCount: 10,
      language: 'en',
      genres: ['Technology'],
    })

    const first = await ensurePodcastDetail(queryClient, '123', 'us')
    const second = await ensurePodcastDetail(queryClient, '123', 'us')

    expect(first).toEqual(second)
    expect(discovery.getPodcastIndexPodcastByItunesId).toHaveBeenCalledTimes(1)
    expect(discovery.getPodcastIndexPodcastByItunesId).toHaveBeenCalledWith(
      '123',
      expect.any(AbortSignal)
    )
  })

  it('reuses cached podcast feed across imperative callers', async () => {
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue({
      title: 'Podcast',
      description: 'desc',
      artworkUrl: 'https://example.com/art.jpg',
      episodes: [
        {
          episodeGuid: 'ep-1',
          title: 'Episode',
          description: 'desc',
          audioUrl: 'https://example.com/audio.mp3',
          pubDate: '2025-01-01T00:00:00Z',
        },
      ],
    })

    const first = await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml')
    const second = await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml')

    expect(first).toEqual(second)
    expect(discovery.fetchPodcastFeed).toHaveBeenCalledTimes(1)
    expect(discovery.fetchPodcastFeed).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
      expect.any(AbortSignal),
      undefined
    )
  })

  it('keeps paged feed windows isolated from full-feed cache entries', async () => {
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue({
      title: 'Podcast',
      description: 'desc',
      artworkUrl: 'https://example.com/art.jpg',
      episodes: [
        {
          episodeGuid: 'ep-1',
          title: 'Episode',
          description: 'desc',
          audioUrl: 'https://example.com/audio.mp3',
          pubDate: '2025-01-01T00:00:00Z',
        },
      ],
    })

    await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml')
    await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    })
    await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    })

    expect(discovery.fetchPodcastFeed).toHaveBeenCalledTimes(2)
    expect(discovery.fetchPodcastFeed).toHaveBeenNthCalledWith(
      1,
      'https://example.com/feed.xml',
      expect.any(AbortSignal),
      undefined
    )
    expect(discovery.fetchPodcastFeed).toHaveBeenNthCalledWith(
      2,
      'https://example.com/feed.xml',
      expect.any(AbortSignal),
      {
        limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
        offset: 0,
      }
    )
  })

  it('keeps paged feed windows isolated across offsets', async () => {
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue({
      title: 'Podcast',
      description: 'desc',
      artworkUrl: 'https://example.com/art.jpg',
      episodes: [],
    })

    await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    })
    await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
    })

    expect(discovery.fetchPodcastFeed).toHaveBeenCalledTimes(2)
    expect(discovery.fetchPodcastFeed).toHaveBeenNthCalledWith(
      1,
      'https://example.com/feed.xml',
      expect.any(AbortSignal),
      {
        limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
        offset: 0,
      }
    )
    expect(discovery.fetchPodcastFeed).toHaveBeenNthCalledWith(
      2,
      'https://example.com/feed.xml',
      expect.any(AbortSignal),
      {
        limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
        offset: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      }
    )
  })
})
