import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEpisodeResolution } from '../useEpisodeResolution'

const getPodcastMock = vi.fn()
const fetchPodcastFeedMock = vi.fn()
const getPodcastEpisodesMock = vi.fn()
const logErrorMock = vi.fn()

vi.mock('@/lib/discovery', () => ({
  default: {
    getPodcast: (...args: unknown[]) => getPodcastMock(...args),
    fetchPodcastFeed: (...args: unknown[]) => fetchPodcastFeedMock(...args),
    getPodcastEpisodes: (...args: unknown[]) => getPodcastEpisodesMock(...args),
  },
}))

vi.mock('@/lib/logger', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

type DeferredPodcast = {
  signal?: AbortSignal
  resolve: (value: { providerPodcastId: number; collectionName: string; feedUrl: string }) => void
  reject: (error: unknown) => void
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useEpisodeResolution cancellation semantics', () => {
  beforeEach(() => {
    getPodcastMock.mockReset()
    fetchPodcastFeedMock.mockReset()
    getPodcastEpisodesMock.mockReset()
    logErrorMock.mockReset()
  })

  it('switches country query key and prevents stale overwrite from old in-flight request', async () => {
    const deferredByCountry = new Map<string, DeferredPodcast>()

    getPodcastMock.mockImplementation((_id: string, country: string, signal?: AbortSignal) => {
      return new Promise((resolve, reject) => {
        deferredByCountry.set(country, {
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

    fetchPodcastFeedMock.mockImplementation((feedUrl: string) => {
      const country = feedUrl.includes('/jp') ? 'jp' : 'us'
      return Promise.resolve({
        title: `Feed ${country}`,
        description: '',
        artworkUrl: '',
        episodes: [
          {
            id: `${country}-episode-id`,
            title: `${country.toUpperCase()} Episode`,
            description: '',
            audioUrl: `https://example.com/${country}.mp3`,
            pubDate: '2025-01-01T00:00:00.000Z',
            providerEpisodeId: 'abc12345',
          },
        ],
      })
    })

    getPodcastEpisodesMock.mockResolvedValue([])

    const { result, rerender } = renderHook(
      ({ country }) => useEpisodeResolution('123', 'abc12345', country),
      {
        initialProps: { country: 'us' },
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => expect(deferredByCountry.has('us')).toBe(true))

    rerender({ country: 'jp' })

    await waitFor(() => expect(deferredByCountry.has('jp')).toBe(true))

    deferredByCountry.get('jp')?.resolve({
      providerPodcastId: 123,
      collectionName: 'JP Podcast',
      feedUrl: 'https://example.com/jp/feed.xml',
    })

    await waitFor(() =>
      expect(result.current.podcast?.feedUrl).toBe('https://example.com/jp/feed.xml')
    )
    await waitFor(() => expect(result.current.episode?.title).toBe('JP Episode'))

    const oldSignal = deferredByCountry.get('us')?.signal
    expect(oldSignal?.aborted).toBe(true)

    deferredByCountry.get('us')?.resolve({
      providerPodcastId: 123,
      collectionName: 'US Podcast',
      feedUrl: 'https://example.com/us/feed.xml',
    })

    await waitFor(() =>
      expect(result.current.podcast?.feedUrl).toBe('https://example.com/jp/feed.xml')
    )
    expect(result.current.episode?.title).toBe('JP Episode')
  })

  it('reuses provider fallback result to avoid duplicate provider fetches', async () => {
    getPodcastMock.mockResolvedValue({
      providerPodcastId: 123,
      collectionName: 'Test Podcast',
      feedUrl: 'https://example.com/feed.xml',
    })

    fetchPodcastFeedMock.mockRejectedValue(new Error('feed failed'))

    getPodcastEpisodesMock.mockResolvedValue([
      {
        id: 'provider-episode-1',
        providerEpisodeId: 'provider-episode-1',
        title: 'Episode One',
        description: '',
        audioUrl: 'https://example.com/audio.mp3',
        pubDate: '2025-01-01T00:00:00.000Z',
      },
    ])

    const { result } = renderHook(() => useEpisodeResolution('123', 'missing-short-id', 'us'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getPodcastEpisodesMock).toHaveBeenCalledTimes(1)
  })

  it('does not fallback to provider or log errors when feed request is aborted', async () => {
    getPodcastMock.mockResolvedValue({
      providerPodcastId: 123,
      collectionName: 'Test Podcast',
      feedUrl: 'https://example.com/feed.xml',
    })

    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    fetchPodcastFeedMock.mockRejectedValue(abortError)
    getPodcastEpisodesMock.mockResolvedValue([])

    const { result } = renderHook(() => useEpisodeResolution('123', 'missing-short-id', 'us'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getPodcastEpisodesMock).not.toHaveBeenCalled()
    expect(logErrorMock).not.toHaveBeenCalled()
    expect(result.current.resolutionError?.name).toBe('AbortError')
  })
})
