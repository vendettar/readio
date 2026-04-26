import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCanonicalPodcastFeedCacheEntry } from '@/lib/discovery/feedCache'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import { createTestQueryClient } from '../../../__tests__/queryClient'
import discovery from '../index'
import {
  PODCAST_DEFAULT_FEED_QUERY_LIMIT,
  PODCAST_QUERY_CACHE_POLICY,
} from '../podcastQueryContract'
import { ensurePodcastDetail, ensurePodcastFeed } from '../queryCache'
import { makeFeedEpisode, makeParsedFeed } from './fixtures'

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
    vi.useRealTimers()
  })

  it('reuses cached podcast detail across imperative callers', async () => {
    vi.mocked(discovery.getPodcastIndexPodcastByItunesId).mockResolvedValue({
      podcastItunesId: '123',
      title: 'Podcast',
      author: 'Host',
      artwork: 'https://example.com/art.jpg',
      description: 'desc',
      feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
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
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue(
      makeParsedFeed({
        title: 'Podcast',
        description: 'desc',
        artworkUrl: 'https://example.com/art.jpg',
        episodes: [
          makeFeedEpisode({
            episodeGuid: 'ep-1',
            title: 'Episode',
            description: 'desc',
            audioUrl: 'https://example.com/audio.mp3',
            pubDate: '2025-01-01T00:00:00Z',
          }),
        ],
      })
    )

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

  it('canonicalizes raw feedUrl before building the feed query key', async () => {
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue(
      makeParsedFeed({
        title: 'Podcast',
        description: 'desc',
        artworkUrl: 'https://example.com/art.jpg',
        episodes: [],
      })
    )

    await ensurePodcastFeed(queryClient, 'HTTP://Example.com:80/feed.xml#frag')
    await ensurePodcastFeed(queryClient, 'http://example.com/feed.xml')

    expect(discovery.fetchPodcastFeed).toHaveBeenCalledTimes(1)
    expect(discovery.fetchPodcastFeed).toHaveBeenCalledWith(
      'http://example.com/feed.xml',
      expect.any(AbortSignal),
      undefined
    )
  })

  it('promotes paged feed responses into the canonical per-feed cache', async () => {
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue(
      makeParsedFeed({
        title: 'Podcast',
        description: 'desc',
        artworkUrl: 'https://example.com/art.jpg',
        pageInfo: {
          limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
          offset: 0,
          returned: 1,
          hasMore: true,
        },
        episodes: [
          makeFeedEpisode({
            episodeGuid: 'ep-1',
            title: 'Episode',
            description: 'desc',
            audioUrl: 'https://example.com/audio.mp3',
            pubDate: '2025-01-01T00:00:00Z',
          }),
        ],
      })
    )

    await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    })

    expect(discovery.fetchPodcastFeed).toHaveBeenCalledTimes(1)
    expect(
      getCanonicalPodcastFeedCacheEntry(queryClient, 'https://example.com/feed.xml')
    ).toMatchObject({
      feedUrl: 'https://example.com/feed.xml',
      coveredRanges: [{ start: 0, end: 1 }],
    })
  })

  it('keeps paged feed windows isolated across offsets', async () => {
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue(
      makeParsedFeed({
        title: 'Podcast',
        description: 'desc',
        artworkUrl: 'https://example.com/art.jpg',
        pageInfo: {
          limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
          offset: 0,
          returned: 1,
          hasMore: true,
        },
        episodes: [makeFeedEpisode({ episodeGuid: 'ep-1' })],
      })
    )

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

  it('reuses canonical first-page coverage for page-one callers without a second network fetch', async () => {
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue(
      makeParsedFeed({
        title: 'Podcast',
        description: 'desc',
        artworkUrl: 'https://example.com/art.jpg',
        pageInfo: {
          limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
          offset: 0,
          returned: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
          hasMore: true,
        },
        episodes: Array.from({ length: PODCAST_DEFAULT_FEED_QUERY_LIMIT }, (_, index) =>
          makeFeedEpisode({ episodeGuid: `ep-${index + 1}` })
        ),
      })
    )

    const first = await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    })
    queryClient.removeQueries({
      queryKey: [
        'podcast',
        'feed',
        'https://example.com/feed.xml',
        'page',
        PODCAST_DEFAULT_FEED_QUERY_LIMIT,
        0,
      ],
      exact: true,
    })

    const second = await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    })

    expect(second).toEqual(first)
    expect(discovery.fetchPodcastFeed).toHaveBeenCalledTimes(1)
  })

  it('does not let a stale canonical feed bypass refetch forever', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'))

    vi.mocked(discovery.fetchPodcastFeed)
      .mockResolvedValueOnce(
        makeParsedFeed({
          title: 'Podcast',
          description: 'desc',
          artworkUrl: 'https://example.com/art.jpg',
          pageInfo: {
            limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
            offset: 0,
            returned: 1,
            hasMore: true,
          },
          episodes: [makeFeedEpisode({ episodeGuid: 'ep-1' })],
        })
      )
      .mockResolvedValueOnce(
        makeParsedFeed({
          title: 'Podcast',
          description: 'desc',
          artworkUrl: 'https://example.com/art.jpg',
          pageInfo: {
            limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
            offset: 0,
            returned: 1,
            hasMore: true,
          },
          episodes: [makeFeedEpisode({ episodeGuid: 'ep-2' })],
        })
      )

    const first = await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    })

    vi.advanceTimersByTime(PODCAST_QUERY_CACHE_POLICY.feed.staleTime + 1)

    const second = await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    })

    expect(first.episodes[0]?.episodeGuid).toBe('ep-1')
    expect(second.episodes[0]?.episodeGuid).toBe('ep-2')
    expect(discovery.fetchPodcastFeed).toHaveBeenCalledTimes(2)
  })

  it('reuses a fully covered canonical tail page without a second network fetch', async () => {
    vi.mocked(discovery.fetchPodcastFeed).mockResolvedValue(
      makeParsedFeed({
        title: 'Podcast',
        description: 'desc',
        artworkUrl: 'https://example.com/art.jpg',
        pageInfo: {
          limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
          offset: 0,
          returned: 25,
          hasMore: false,
        },
        episodes: Array.from({ length: 25 }, (_, index) =>
          makeFeedEpisode({ episodeGuid: `ep-${index + 1}` })
        ),
      })
    )

    await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml')

    const tailPage = await ensurePodcastFeed(queryClient, 'https://example.com/feed.xml', {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
    })

    expect(tailPage.pageInfo).toEqual({
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      returned: 5,
      hasMore: false,
    })
    expect(tailPage.episodes).toHaveLength(5)
    expect(discovery.fetchPodcastFeed).toHaveBeenCalledTimes(1)
  })
})
