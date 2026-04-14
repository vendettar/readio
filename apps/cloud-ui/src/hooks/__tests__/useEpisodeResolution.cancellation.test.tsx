import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Episode, ParsedFeed, Podcast } from '../../lib/discovery'
import {
  buildPodcastFeedQueryKey,
  buildPodcastIndexLookupQueryKey,
} from '../../lib/discovery/podcastQueryContract'
import { resolveEpisodeResolutionError, useEpisodeResolution } from '../useEpisodeResolution'

const getPodcastIndexPodcastByItunesIdMock = vi.fn()
const getPodcastIndexEpisodesMock = vi.fn()
const getPodcastIndexEpisodeByGuidMock = vi.fn()
const fetchPodcastFeedMock = vi.fn()

vi.mock('@/lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: (...args: unknown[]) =>
      getPodcastIndexPodcastByItunesIdMock(...args),
    getPodcastIndexEpisodes: (...args: unknown[]) => getPodcastIndexEpisodesMock(...args),
    getPodcastIndexEpisodeByGuid: (...args: unknown[]) => getPodcastIndexEpisodeByGuidMock(...args),
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

function createWrapper(options: WrapperOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  if (options.podcast) {
    queryClient.setQueryData(
      buildPodcastIndexLookupQueryKey(options.podcast.podcastItunesId ?? '12345', 'us'),
      options.podcast
    )
  }

  if (options.feed && options.podcast?.feedUrl) {
    queryClient.setQueryData(buildPodcastFeedQueryKey(options.podcast.feedUrl), options.feed)
  }

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return { queryClient, wrapper }
}

describe('useEpisodeResolution cancellation semantics', () => {
  beforeEach(() => {
    getPodcastIndexPodcastByItunesIdMock.mockReset()
    getPodcastIndexEpisodesMock.mockReset()
    getPodcastIndexEpisodeByGuidMock.mockReset()
    fetchPodcastFeedMock.mockReset()
    fetchPodcastFeedMock.mockResolvedValue({ episodes: [] })
  })

  it('returns feed errors when no higher-priority lookup error exists', () => {
    const resolutionError = resolveEpisodeResolutionError({
      podcastError: null,
      feedError: new Error('feed failed'),
      supplementalEpisodesError: null,
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
    getPodcastIndexEpisodesMock.mockResolvedValue([])
    getPodcastIndexEpisodeByGuidMock.mockResolvedValue(null)

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

    deferredCalls[1]?.resolve({
      podcastItunesId: '12345',
      title: 'JP Podcast',
      author: 'Host',
      image: 'https://example.com/show-100.jpg',
      artwork: 'https://example.com/show-600.jpg',
      feedUrl: 'https://example.com/jp-feed.xml',
      collectionViewUrl: 'https://example.com/show',
      genres: [{ genreId: '1', name: 'Technology' }],
    })

    await waitFor(() =>
      expect(result.current.podcast?.feedUrl).toBe('https://example.com/jp-feed.xml')
    )

    const oldSignal = deferredCalls[0]?.signal
    expect(oldSignal?.aborted).toBe(true)

    deferredCalls[0]?.resolve({
      podcastItunesId: '12345',
      title: 'US Podcast',
      author: 'Host',
      image: 'https://example.com/show-100.jpg',
      artwork: 'https://example.com/show-600.jpg',
      feedUrl: 'https://example.com/us-feed.xml',
      collectionViewUrl: 'https://example.com/show',
      genres: [{ genreId: '1', name: 'Technology' }],
    })

    await waitFor(() =>
      expect(result.current.podcast?.feedUrl).toBe('https://example.com/jp-feed.xml')
    )
  })

  it('uses cached feed data for warm navigation without extra PI episode lookups', async () => {
    const podcast: Podcast = {
      podcastItunesId: '12345',
      title: 'Warm Podcast',
      author: 'Host',
      image: 'https://example.com/show-100.jpg',
      artwork: 'https://example.com/show-600.jpg',
      feedUrl: 'https://example.com/feed.xml',
      collectionViewUrl: 'https://example.com/show',
      genres: [{ genreId: '1', name: 'Technology' }],
    }
    const feed: ParsedFeed = {
      title: 'Warm Podcast',
      description: '',
      artworkUrl: 'https://example.com/show-600.jpg',
      episodes: [
        {
          id: '766f112e-abcd-1234-5678-07e05e548074',
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
    expect(getPodcastIndexEpisodesMock).not.toHaveBeenCalled()
    expect(getPodcastIndexEpisodeByGuidMock).not.toHaveBeenCalled()
    expect(fetchPodcastFeedMock).not.toHaveBeenCalled()
    expect(result.current.episode?.title).toBe('Warm Episode')
  })

  it('resolves cold opens from PI recent episodes before fetching RSS', async () => {
    getPodcastIndexPodcastByItunesIdMock.mockResolvedValue({
      podcastItunesId: '12345',
      title: 'Cold Podcast',
      author: 'Host',
      image: 'https://example.com/show-100.jpg',
      artwork: 'https://example.com/show-600.jpg',
      feedUrl: 'https://example.com/feed.xml',
      collectionViewUrl: 'https://example.com/show',
      genres: [{ genreId: '1', name: 'Technology' }],
    })
    getPodcastIndexEpisodesMock.mockResolvedValue([
      {
        id: '766f112e-abcd-1234-5678-07e05e548074',
        episodeGuid: '766f112e-abcd-1234-5678-07e05e548074',
        title: 'Recent Episode',
        description: '',
        audioUrl: 'https://example.com/audio.mp3',
        pubDate: '2025-01-01T00:00:00.000Z',
      } satisfies Episode,
    ])
    getPodcastIndexEpisodeByGuidMock.mockResolvedValue(null)

    const { result } = renderHook(
      () => useEpisodeResolution('12345', 'dm8RLqvNEjRWeAfgXlSAdA', 'us'),
      {
        wrapper: createWrapper().wrapper,
      }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getPodcastIndexPodcastByItunesIdMock).toHaveBeenCalledWith('12345', expect.anything())
    expect(getPodcastIndexEpisodesMock).toHaveBeenCalledWith('12345', 60, expect.anything())
    expect(getPodcastIndexEpisodeByGuidMock).not.toHaveBeenCalled()
    expect(fetchPodcastFeedMock).not.toHaveBeenCalled()
    expect(result.current.episode?.title).toBe('Recent Episode')
  })

  it('falls back to PI episode-byguid when the recent window misses', async () => {
    getPodcastIndexPodcastByItunesIdMock.mockResolvedValue({
      podcastItunesId: '12345',
      title: 'Cold Podcast',
      author: 'Host',
      image: 'https://example.com/show-100.jpg',
      artwork: 'https://example.com/show-600.jpg',
      feedUrl: 'https://example.com/feed.xml',
      collectionViewUrl: 'https://example.com/show',
      genres: [{ genreId: '1', name: 'Technology' }],
    })
    getPodcastIndexEpisodesMock.mockResolvedValue([
      {
        id: 'another-guid',
        episodeGuid: 'another-guid',
        title: 'Another Episode',
        description: '',
        audioUrl: 'https://example.com/another.mp3',
        pubDate: '2025-01-01T00:00:00.000Z',
      } satisfies Episode,
    ])
    getPodcastIndexEpisodeByGuidMock.mockResolvedValue({
      id: '766f112e-abcd-1234-5678-07e05e548074',
      episodeGuid: '766f112e-abcd-1234-5678-07e05e548074',
      title: 'Exact Episode',
      description: '',
      audioUrl: 'https://example.com/audio.mp3',
      pubDate: '2025-01-01T00:00:00.000Z',
    })

    const { result } = renderHook(
      () => useEpisodeResolution('12345', 'dm8RLqvNEjRWeAfgXlSAdA', 'us'),
      {
        wrapper: createWrapper().wrapper,
      }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getPodcastIndexEpisodeByGuidMock).toHaveBeenCalledWith(
      '766f112e-abcd-1234-5678-07e05e548074',
      '12345',
      expect.anything()
    )
    expect(fetchPodcastFeedMock).not.toHaveBeenCalled()
    expect(result.current.episode?.title).toBe('Exact Episode')
  })

  it('uses RSS only as the last resort after PI misses', async () => {
    getPodcastIndexPodcastByItunesIdMock.mockResolvedValue({
      podcastItunesId: '12345',
      collectionName: 'Cold Podcast',
      artistName: 'Host',
      artworkUrl100: 'https://example.com/show-100.jpg',
      artworkUrl600: 'https://example.com/show-600.jpg',
      feedUrl: 'https://example.com/feed.xml',
      collectionViewUrl: 'https://example.com/show',
      genres: [{ genreId: '1', name: 'Technology' }],
    })
    getPodcastIndexEpisodesMock.mockResolvedValue([])
    getPodcastIndexEpisodeByGuidMock.mockResolvedValue(null)
    fetchPodcastFeedMock.mockResolvedValue({
      title: 'Cold Podcast',
      description: '',
      artworkUrl: 'https://example.com/show-600.jpg',
      episodes: [
        {
          id: '766f112e-abcd-1234-5678-07e05e548074',
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
    expect(getPodcastIndexEpisodesMock).toHaveBeenCalledTimes(1)
    expect(getPodcastIndexEpisodeByGuidMock).toHaveBeenCalledTimes(1)
    expect(fetchPodcastFeedMock).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
      expect.anything()
    )
    expect(result.current.episode?.title).toBe('RSS Episode')
  })
})
