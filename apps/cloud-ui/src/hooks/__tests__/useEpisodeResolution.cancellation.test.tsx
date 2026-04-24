import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClientHarness } from '../../__tests__/queryClient'
import type { ParsedFeed, Podcast } from '../../lib/discovery'
import {
  buildPodcastFeedQueryKey,
  buildPodcastDetailQueryKey,
} from '../../lib/discovery/podcastQueryContract'
import { episodeIdentityToCompactKey } from '../../lib/routes/compactKey'
import { resolveEpisodeResolutionError, useEpisodeResolution } from '../useEpisodeResolution'

const getPodcastIndexPodcastByItunesIdMock = vi.fn()
const fetchPodcastFeedMock = vi.fn()

vi.mock('@/lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: (...args: unknown[]) =>
      getPodcastIndexPodcastByItunesIdMock(...args),
    fetchPodcastFeed: (...args: unknown[]) => fetchPodcastFeedMock(...args),
  },
}))

type WrapperOptions = {
  podcast?: Podcast
  feed?: ParsedFeed
}

type DeferredPodcast = {
  signal?: AbortSignal
  resolve: (value: Podcast) => void
  reject: (error: unknown) => void
}

function makePodcast(
  overrides: Partial<Podcast> & Pick<Podcast, 'podcastItunesId' | 'title' | 'author' | 'feedUrl'>
): Podcast {
  return {
    artwork: 'https://example.com/show-600.jpg',
    description: 'A podcast',
    lastUpdateTime: 1613394044,
    episodeCount: 50,
    language: 'en',
    genres: ['Technology'],
    ...overrides,
  }
}

function createWrapper(options: WrapperOptions = {}) {
  return createQueryClientHarness({
    setup: (queryClient) => {
      if (options.podcast) {
        queryClient.setQueryData(
          buildPodcastDetailQueryKey(options.podcast.podcastItunesId ?? '12345', 'us'),
          options.podcast
        )
      }

      if (options.feed && options.podcast?.feedUrl) {
        queryClient.setQueryData(
          buildPodcastFeedQueryKey(options.podcast.feedUrl),
          options.feed
        )
      }
    },
  })
}

describe('useEpisodeResolution cancellation semantics', () => {
  beforeEach(() => {
    getPodcastIndexPodcastByItunesIdMock.mockReset()
    fetchPodcastFeedMock.mockReset()
    fetchPodcastFeedMock.mockResolvedValue({ episodes: [] })
  })

  it('returns feed errors when no higher-priority lookup error exists', () => {
    const resolutionError = resolveEpisodeResolutionError({
      podcastError: null,
      feedError: new Error('feed failed'),
    })

    expect(resolutionError?.message).toBe('feed failed')
  })

  it('switches country query key and prevents stale overwrite from old in-flight request', async () => {
    const deferredCalls: DeferredPodcast[] = []

    getPodcastIndexPodcastByItunesIdMock.mockImplementation((_id: string, signal?: AbortSignal) => {
      return new Promise((resolve, reject) => {
        deferredCalls.push({
          signal,
          resolve: resolve as DeferredPodcast['resolve'],
          reject,
        })
        signal?.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          { once: true }
        )
      })
    })

    const { result, rerender } = renderHook(
      ({ country }) => useEpisodeResolution('12345', 'dm8RLqvNEjRWeAfgXlSAdA', country),
      {
        initialProps: { country: 'us' },
        wrapper: createWrapper().wrapper,
      }
    )

    await waitFor(() => expect(deferredCalls).toHaveLength(1))

    rerender({ country: 'jp' })

    await waitFor(() => expect(deferredCalls).toHaveLength(2))

    deferredCalls[1]?.resolve(
      makePodcast({
        podcastItunesId: '12345',
        title: 'JP Podcast',
        author: 'Host',
        feedUrl: 'https://example.com/jp-feed.xml',
      })
    )

    await waitFor(() =>
      expect(result.current.podcast?.feedUrl).toBe('https://example.com/jp-feed.xml')
    )

    const oldSignal = deferredCalls[0]?.signal
    expect(oldSignal?.aborted).toBe(true)

    deferredCalls[0]?.resolve(
      makePodcast({
        podcastItunesId: '12345',
        title: 'US Podcast',
        author: 'Host',
        feedUrl: 'https://example.com/us-feed.xml',
      })
    )

    await waitFor(() =>
      expect(result.current.podcast?.feedUrl).toBe('https://example.com/jp-feed.xml')
    )
  })

  it('uses cached feed data for warm navigation without extra network fetches', async () => {
    const podcast: Podcast = makePodcast({
      podcastItunesId: '12345',
      title: 'Warm Podcast',
      author: 'Host',
      feedUrl: 'https://example.com/feed.xml',
    })
    const feed: ParsedFeed = {
      title: 'Warm Podcast',
      description: '',
      artworkUrl: 'https://example.com/show-600.jpg',
      episodes: [
        {
          episodeGuid: '766f112e-abcd-1234-5678-07e05e548074',
          title: 'Warm Episode',
          description: '',
          audioUrl: 'https://example.com/audio.mp3',
          pubDate: '2025-01-01T00:00:00.000Z',
        },
      ],
    }

    const { result } = renderHook(
      () => useEpisodeResolution('12345', 'dm8RLqvNEjRWeAfgXlSAdA', 'us'),
      {
        wrapper: createWrapper({ podcast, feed }).wrapper,
      }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getPodcastIndexPodcastByItunesIdMock).not.toHaveBeenCalled()
    expect(fetchPodcastFeedMock).not.toHaveBeenCalled()
    expect(result.current.episode?.title).toBe('Warm Episode')
  })

  it('resolves cold opens from RSS feed when no cached episode exists', async () => {
    getPodcastIndexPodcastByItunesIdMock.mockResolvedValue(
      makePodcast({
        podcastItunesId: '12345',
        title: 'Cold Podcast',
        author: 'Host',
        feedUrl: 'https://example.com/feed.xml',
      })
    )
    fetchPodcastFeedMock.mockResolvedValue({
      title: 'Cold Podcast',
      description: '',
      artworkUrl: 'https://example.com/show-600.jpg',
      episodes: [
        {
          episodeGuid: '766f112e-abcd-1234-5678-07e05e548074',
          title: 'RSS Episode',
          description: '',
          audioUrl: 'https://example.com/audio.mp3',
          pubDate: '2025-01-01T00:00:00.000Z',
        },
      ],
    } satisfies ParsedFeed)

    const { result } = renderHook(
      () => useEpisodeResolution('12345', 'dm8RLqvNEjRWeAfgXlSAdA', 'us'),
      {
        wrapper: createWrapper().wrapper,
      }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getPodcastIndexPodcastByItunesIdMock).toHaveBeenCalledWith('12345', expect.anything())
    expect(fetchPodcastFeedMock).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
      expect.anything()
    )
    expect(result.current.episode?.title).toBe('RSS Episode')
  })

  it('resolves older deep links beyond the first 100 feed entries', async () => {
    const olderEpisodeGuid = 'older-episode-guid'
    const olderEpisodeKey = episodeIdentityToCompactKey(olderEpisodeGuid)
    if (!olderEpisodeKey) throw new Error('expected older episode compact key')

    getPodcastIndexPodcastByItunesIdMock.mockResolvedValue(
      makePodcast({
        podcastItunesId: '12345',
        title: 'Deep Link Podcast',
        author: 'Host',
        feedUrl: 'https://example.com/feed.xml',
      })
    )
    fetchPodcastFeedMock.mockImplementation(
      async (_feedUrl: string, _signal?: AbortSignal, limit?: number) => ({
        title: 'Deep Link Podcast',
        description: '',
        artworkUrl: 'https://example.com/show-600.jpg',
        episodes: Array.from({ length: typeof limit === 'number' ? limit : 150 }, (_, index) => {
          const episodeNumber = index + 1
          return {
            episodeGuid:
              episodeNumber === 150 ? olderEpisodeGuid : `episode-guid-${episodeNumber}`,
            title:
              episodeNumber === 150 ? 'Older RSS Episode' : `Episode ${episodeNumber}`,
            description: '',
            audioUrl: `https://example.com/audio-${episodeNumber}.mp3`,
            pubDate: '2025-01-01T00:00:00.000Z',
          }
        }),
      })
    )

    const { result } = renderHook(
      () => useEpisodeResolution('12345', olderEpisodeKey, 'us'),
      {
        wrapper: createWrapper().wrapper,
      }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchPodcastFeedMock).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
      expect.anything()
    )
    expect(result.current.episode?.title).toBe('Older RSS Episode')
  })

  it('returns null when feedUrl is unavailable for fallback', async () => {
    getPodcastIndexPodcastByItunesIdMock.mockResolvedValue(
      makePodcast({
        podcastItunesId: '12345',
        title: 'Cold Podcast',
        author: 'Host',
        feedUrl: '',
      })
    )

    const { result } = renderHook(
      () => useEpisodeResolution('12345', 'dm8RLqvNEjRWeAfgXlSAdA', 'us'),
      {
        wrapper: createWrapper().wrapper,
      }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchPodcastFeedMock).not.toHaveBeenCalled()
    expect(result.current.episode).toBeUndefined()
  })
})
