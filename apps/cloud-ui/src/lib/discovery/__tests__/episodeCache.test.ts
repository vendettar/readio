import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../../__tests__/queryClient'
import {
  findEpisodeInPodcastEpisodesCache,
  getPodcastEpisodesBootstrapSnapshot,
  getPodcastEpisodesCacheEntries,
  readPodcastEpisodesFromCache,
  writePodcastEpisodesToCache,
} from '../episodeCache'
import {
  buildPodcastEpisodesPagesQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from '../podcastQueryContract'
import { makeEpisode, makePodcastEpisodes } from './fixtures'

describe('podcast episode cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'))
  })

  it('stores one episode-page payload for a podcast', () => {
    const queryClient = createTestQueryClient()

    const written = writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [
          makeEpisode({ guid: 'ep-1' }),
          makeEpisode({ guid: 'ep-2', audioUrl: 'https://example.com/ep-2.mp3' }),
        ],
      })
    )

    expect(written.episodes).toHaveLength(2)
    expect(getPodcastEpisodesCacheEntries(queryClient, '123')).toEqual([
      expect.objectContaining({
        queryKey: buildPodcastEpisodesPagesQueryKey('123'),
        data: expect.objectContaining({
          episodes: [
            expect.objectContaining({ guid: 'ep-1' }),
            expect.objectContaining({ guid: 'ep-2' }),
          ],
        }),
      }),
    ])
  })

  it('fails closed when queryClient cache inspection is unavailable', () => {
    const partialQueryClient = {
      getQueryData: vi.fn(() => undefined),
      getQueryState: vi.fn(() => undefined),
    } as unknown as Parameters<typeof getPodcastEpisodesCacheEntries>[0]

    expect(getPodcastEpisodesCacheEntries(partialQueryClient, '123')).toEqual([])
    expect(getPodcastEpisodesBootstrapSnapshot(partialQueryClient, '123')).toBeUndefined()
    expect(findEpisodeInPodcastEpisodesCache(partialQueryClient, '123', 'ep-1')).toBeUndefined()
  })

  it('fails closed for empty canonical cache keys even with string-only helpers', () => {
    const queryClient = createTestQueryClient()

    expect(getPodcastEpisodesCacheEntries(queryClient, '')).toEqual([])
    expect(readPodcastEpisodesFromCache(queryClient, '')).toBeUndefined()
    expect(getPodcastEpisodesBootstrapSnapshot(queryClient, '')).toBeUndefined()
    expect(findEpisodeInPodcastEpisodesCache(queryClient, '123', '')).toBeUndefined()
  })

  it('serves warm bootstrap snapshots from the episode-pages family', () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'ep-1' })],
      })
    )

    expect(getPodcastEpisodesBootstrapSnapshot(queryClient, '123')).toEqual({
      data: expect.objectContaining({
        episodes: [expect.objectContaining({ guid: 'ep-1' })],
        limit: 20,
        offset: 0,
        nextOffset: 20,
        hasMore: true,
        storedTotal: 1000,
        isTruncated: true,
      }),
      updatedAt: Date.now(),
    })
  })

  it('serves fresh same-podcast cache without podcast freshness gates', () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'ep-1' })],
      })
    )

    expect(readPodcastEpisodesFromCache(queryClient, '123')).toEqual(
      expect.objectContaining({
        episodes: [expect.objectContaining({ guid: 'ep-1' })],
      })
    )
    expect(getPodcastEpisodesBootstrapSnapshot(queryClient, '123')).toEqual({
      data: expect.objectContaining({
        episodes: [expect.objectContaining({ guid: 'ep-1' })],
        limit: 20,
        offset: 0,
        nextOffset: 20,
        hasMore: true,
        storedTotal: 1000,
        isTruncated: true,
      }),
      updatedAt: Date.now(),
    })
  })

  it('distinguishes broad cache inspection from exact unscoped cache reads', () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'us-ep' })],
      }),
      { country: 'us' }
    )

    expect(getPodcastEpisodesCacheEntries(queryClient, '123')).toEqual([
      expect.objectContaining({
        queryKey: buildPodcastEpisodesPagesQueryKey('123', 'us'),
      }),
    ])
    expect(readPodcastEpisodesFromCache(queryClient, '123')).toBeUndefined()
    expect(readPodcastEpisodesFromCache(queryClient, '123', { country: 'us' })).toEqual(
      expect.objectContaining({
        episodes: [expect.objectContaining({ guid: 'us-ep' })],
      })
    )
  })

  it('does not treat stale episode cache as a fresh cache hit', () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'ep-1' })],
      })
    )

    vi.advanceTimersByTime(PODCAST_QUERY_CACHE_POLICY.episodes.staleTime + 1)

    expect(readPodcastEpisodesFromCache(queryClient, '123')).toBeUndefined()
    expect(getPodcastEpisodesBootstrapSnapshot(queryClient, '123')).toBeUndefined()
  })

  it('does not serve invalidated episode page data as a fresh cache hit', async () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'stale-ep' })],
      })
    )

    await queryClient.invalidateQueries({
      queryKey: buildPodcastEpisodesPagesQueryKey('123'),
      exact: true,
      refetchType: 'none',
    })

    expect(readPodcastEpisodesFromCache(queryClient, '123')).toBeUndefined()
    expect(getPodcastEpisodesBootstrapSnapshot(queryClient, '123')).toBeUndefined()
    expect(findEpisodeInPodcastEpisodesCache(queryClient, '123', 'stale-ep')).toBeUndefined()
  })

  it('finds episodes by episodeGuid from the same episode-pages source', () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [
          makeEpisode({ guid: 'ep-1' }),
          makeEpisode({ guid: 'ep-2', title: 'Second Episode' }),
        ],
      })
    )

    expect(findEpisodeInPodcastEpisodesCache(queryClient, '123', 'ep-2')?.title).toBe(
      'Second Episode'
    )
    expect(findEpisodeInPodcastEpisodesCache(queryClient, '123', 'missing-guid')).toBeUndefined()
  })

  it('requires request-key ownership and deduplicates duplicate guid entries', () => {
    const queryClient = createTestQueryClient()

    expect(() =>
      writePodcastEpisodesToCache(
        queryClient,
        '   ',
        makePodcastEpisodes({
          episodes: [makeEpisode({ guid: 'ep-1' })],
        })
      )
    ).toThrow(/non-empty podcastItunesId/)

    const written = writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [
          makeEpisode({ guid: 'duplicate-guid', title: 'First Title' }),
          makeEpisode({ guid: 'duplicate-guid', title: 'Second Title' }),
        ],
      })
    )

    expect(written.episodes).toEqual([expect.objectContaining({ title: 'First Title' })])
  })

  it('overwrites the same episode-pages cache after a successful refresh', () => {
    const queryClient = createTestQueryClient()

    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'older-guid', title: 'Older' })],
      })
    )

    vi.advanceTimersByTime(1_000)

    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'newer-guid', title: 'Newer' })],
      })
    )

    expect(getPodcastEpisodesCacheEntries(queryClient, '123')).toEqual([
      expect.objectContaining({
        queryKey: buildPodcastEpisodesPagesQueryKey('123'),
        data: expect.objectContaining({
          episodes: [expect.objectContaining({ guid: 'newer-guid' })],
        }),
      }),
    ])
  })
})
