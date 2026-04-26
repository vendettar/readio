import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../../__tests__/queryClient'
import {
  getCanonicalPodcastFeedCacheEntry,
  materializePodcastFeedFromCanonicalEntry,
  readPodcastFeedSliceFromCanonicalCache,
  writePodcastFeedPageToCaches,
} from '../feedCache'
import { normalizeFeedUrl } from '../feedUrl'
import { buildPodcastFeedQueryKey, PODCAST_QUERY_CACHE_POLICY } from '../podcastQueryContract'
import { makeFeedEpisode, makeParsedFeed } from './fixtures'

describe('canonical podcast feed cache', () => {
  const feedUrl = normalizeFeedUrl('https://example.com/feed.xml')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('anchors canonical positioning to the requested offset instead of response pageInfo metadata', () => {
    const queryClient = createTestQueryClient()

    const writtenPage = writePodcastFeedPageToCaches(
      queryClient,
      feedUrl,
      makeParsedFeed({
        pageInfo: {
          limit: 20,
          offset: 0,
          returned: 1,
          hasMore: true,
        },
        episodes: [makeFeedEpisode({ episodeGuid: 'ep-21' })],
      }),
      {
        limit: 20,
        offset: 20,
      }
    )

    expect(getCanonicalPodcastFeedCacheEntry(queryClient, feedUrl)?.coveredRanges).toEqual([
      { start: 20, end: 21 },
    ])
    expect(writtenPage.pageInfo).toEqual({
      limit: 20,
      offset: 20,
      returned: 1,
      hasMore: true,
    })
    expect(
      queryClient.getQueryData(
        buildPodcastFeedQueryKey(feedUrl, {
          limit: 20,
          offset: 20,
        })
      )
    ).toEqual({
      ...writtenPage,
    })
  })

  it('invalidates old tail coverage when a stale page-0 refresh changes the head order', () => {
    const queryClient = createTestQueryClient()

    writePodcastFeedPageToCaches(
      queryClient,
      feedUrl,
      makeParsedFeed({
        pageInfo: {
          limit: 20,
          offset: 0,
          returned: 2,
          hasMore: true,
        },
        episodes: [
          makeFeedEpisode({ episodeGuid: 'ep-1' }),
          makeFeedEpisode({ episodeGuid: 'ep-2', audioUrl: 'https://example.com/ep-2.mp3' }),
        ],
      }),
      { limit: 20, offset: 0 }
    )
    writePodcastFeedPageToCaches(
      queryClient,
      feedUrl,
      makeParsedFeed({
        pageInfo: {
          limit: 20,
          offset: 20,
          returned: 1,
          hasMore: false,
        },
        episodes: [makeFeedEpisode({ episodeGuid: 'ep-21' })],
      }),
      { limit: 20, offset: 20 }
    )

    vi.advanceTimersByTime(PODCAST_QUERY_CACHE_POLICY.feed.staleTime + 1)

    writePodcastFeedPageToCaches(
      queryClient,
      feedUrl,
      makeParsedFeed({
        pageInfo: {
          limit: 20,
          offset: 0,
          returned: 2,
          hasMore: true,
        },
        episodes: [
          makeFeedEpisode({ episodeGuid: 'ep-new' }),
          makeFeedEpisode({ episodeGuid: 'ep-1', audioUrl: 'https://example.com/ep-1.mp3' }),
        ],
      }),
      { limit: 20, offset: 0 }
    )

    const entry = getCanonicalPodcastFeedCacheEntry(queryClient, feedUrl)
    expect(entry?.coveredRanges).toEqual([{ start: 0, end: 2 }])
    expect(entry?.terminalEndExclusive).toBeUndefined()
    expect(entry?.episodesByIndex[2]).toBeUndefined()
    expect(
      readPodcastFeedSliceFromCanonicalCache(queryClient, feedUrl, {
        limit: 20,
        offset: 20,
      })
    ).toBeUndefined()
    expect(
      queryClient.getQueryData(
        buildPodcastFeedQueryKey(feedUrl, {
          limit: 20,
          offset: 20,
        })
      )
    ).toBeUndefined()
  })

  it('shrinks stale canonical tail coverage when an authoritative refresh reports a shorter feed', () => {
    const queryClient = createTestQueryClient()

    writePodcastFeedPageToCaches(
      queryClient,
      feedUrl,
      makeParsedFeed({
        episodes: [
          makeFeedEpisode({ episodeGuid: 'ep-1' }),
          makeFeedEpisode({ episodeGuid: 'ep-2', audioUrl: 'https://example.com/ep-2.mp3' }),
          makeFeedEpisode({ episodeGuid: 'ep-3', audioUrl: 'https://example.com/ep-3.mp3' }),
        ],
      })
    )

    vi.advanceTimersByTime(PODCAST_QUERY_CACHE_POLICY.feed.staleTime + 1)

    writePodcastFeedPageToCaches(
      queryClient,
      feedUrl,
      makeParsedFeed({
        pageInfo: {
          limit: 20,
          offset: 0,
          returned: 2,
          hasMore: false,
        },
        episodes: [
          makeFeedEpisode({ episodeGuid: 'ep-1' }),
          makeFeedEpisode({ episodeGuid: 'ep-2', audioUrl: 'https://example.com/ep-2.mp3' }),
        ],
      }),
      { limit: 20, offset: 0 }
    )

    const entry = getCanonicalPodcastFeedCacheEntry(queryClient, feedUrl)
    expect(entry?.terminalEndExclusive).toBe(2)
    if (!entry) {
      throw new Error('Expected entry to exist')
    }
    expect(materializePodcastFeedFromCanonicalEntry(entry)).toMatchObject({
      episodes: [{ episodeGuid: 'ep-1' }, { episodeGuid: 'ep-2' }],
    })
    expect(entry?.episodesByIndex[2]).toBeUndefined()
  })
})
