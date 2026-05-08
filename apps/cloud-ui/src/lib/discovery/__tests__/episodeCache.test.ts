import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../../__tests__/queryClient'
import {
  findEpisodeInPodcastEpisodesCache,
  getPodcastEpisodesBootstrapSnapshot,
  getPodcastEpisodesCacheEntries,
  readPodcastEpisodesFromCache,
  writePodcastEpisodesToCache,
} from '../episodeCache'
import { buildPodcastEpisodesQueryKey, PODCAST_QUERY_CACHE_POLICY } from '../podcastQueryContract'
import { makeEpisode, makePodcastEpisodes } from './fixtures'

describe('podcast episode cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'))
  })

  it('stores one authority-aware PI episode-list payload for a podcast', () => {
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
        queryKey: buildPodcastEpisodesQueryKey('123'),
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

  it('serves warm bootstrap snapshots from the PI episode-list family', () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'ep-1' })],
      })
    )

    expect(getPodcastEpisodesBootstrapSnapshot(queryClient, '123')).toEqual({
      data: {
        episodes: [expect.objectContaining({ guid: 'ep-1' })],
      },
      updatedAt: Date.now(),
      isAuthoritative: true,
    })
  })

  it('invalidates fresh reads when authoritative podcast markers drift', () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'ep-1' })],
      }),
      {
        authority: {
          lastUpdateTime: 1,
          episodeCount: 10,
        },
      }
    )

    expect(
      readPodcastEpisodesFromCache(queryClient, '123', {
        authority: { lastUpdateTime: 2, episodeCount: 10 },
      })
    ).toBeUndefined()
    expect(getPodcastEpisodesBootstrapSnapshot(queryClient, '123')).toEqual({
      data: {
        episodes: [expect.objectContaining({ guid: 'ep-1' })],
      },
      updatedAt: Date.now(),
      isAuthoritative: true,
    })
    expect(
      getPodcastEpisodesBootstrapSnapshot(queryClient, '123', {
        lastUpdateTime: 1,
        episodeCount: 11,
      })
    ).toEqual({
      data: {
        episodes: [expect.objectContaining({ guid: 'ep-1' })],
      },
      updatedAt: 0,
      isAuthoritative: false,
    })
  })

  it('does not treat stale episode cache as fresh exact-authority coverage', () => {
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

  it('finds episodes by episodeGuid from the same PI episode-list source', () => {
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

  it('does not resolve an episode from a bootstrap snapshot when authority markers mismatch', () => {
    const queryClient = createTestQueryClient()
    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'ep-1', title: 'Authority Scoped Episode' })],
      }),
      {
        authority: {
          lastUpdateTime: 1,
          episodeCount: 10,
        },
      }
    )

    expect(
      findEpisodeInPodcastEpisodesCache(queryClient, '123', 'ep-1', {
        lastUpdateTime: 2,
        episodeCount: 10,
      })
    ).toBeUndefined()
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

  it('removes superseded authority-key variants after a successful refresh', () => {
    const queryClient = createTestQueryClient()

    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'older-guid', title: 'Older' })],
      }),
      {
        authority: { lastUpdateTime: 1, episodeCount: 10 },
      }
    )

    vi.advanceTimersByTime(1_000)

    writePodcastEpisodesToCache(
      queryClient,
      '123',
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'newer-guid', title: 'Newer' })],
      }),
      {
        authority: { lastUpdateTime: 2, episodeCount: 10 },
      }
    )

    expect(getPodcastEpisodesCacheEntries(queryClient, '123')).toEqual([
      expect.objectContaining({
        queryKey: buildPodcastEpisodesQueryKey('123', {
          lastUpdateTime: 2,
          episodeCount: 10,
        }),
        data: expect.objectContaining({
          episodes: [expect.objectContaining({ guid: 'newer-guid' })],
        }),
      }),
    ])
  })
})
