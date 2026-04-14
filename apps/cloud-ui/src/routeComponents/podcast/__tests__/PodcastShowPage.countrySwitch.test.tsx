import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastShowPage from '../PodcastShowPage'

const getPodcastMock = vi.fn()
const fetchPodcastFeedMock = vi.fn()
const getPodcastEpisodesMock = vi.fn()

let routeCountry = 'us'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useLocation: () => ({ state: null }),
  useParams: () => ({ country: routeCountry, id: '123' }),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
      subscriptions: [],
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      isFavorited: () => false,
    }),
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: vi.fn(),
  }),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: (...args: unknown[]) => getPodcastMock(...args),
    fetchPodcastFeed: (...args: unknown[]) => fetchPodcastFeedMock(...args),
    getPodcastIndexEpisodes: (...args: unknown[]) => getPodcastEpisodesMock(...args),
  },
}))

type DeferredPodcast = {
  signal?: AbortSignal
  resolve: (value: {
    podcastItunesId: string
    collectionName: string
    artistName: string
    feedUrl: string
    artworkUrl600: string
    artworkUrl100: string
    genres: string[]
    collectionViewUrl: string
  }) => void
  reject: (error: unknown) => void
}

function createWrapper() {
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

describe('PodcastShowPage country switch cancellation', () => {
  beforeEach(() => {
    routeCountry = 'us'
    getPodcastMock.mockReset()
    fetchPodcastFeedMock.mockReset()
    getPodcastEpisodesMock.mockReset()
  })

  it('aborts old-country lookup and keeps latest country content', async () => {
    const deferredByCountry = new Map<string, DeferredPodcast>()

    getPodcastMock.mockImplementation((_id: string, signal?: AbortSignal) => {
      const country = routeCountry
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
      const country = feedUrl.includes('/jp/') ? 'jp' : 'us'
      return Promise.resolve({
        title: `Feed ${country}`,
        description: '',
        artworkUrl: '',
        episodes: [
          {
            id: `${country}-ep-1`,
            providerEpisodeId: `${country}-provider-1`,
            title: `${country.toUpperCase()} Episode`,
            description: '',
            audioUrl: `https://example.com/${country}/audio.mp3`,
            pubDate: '2025-01-01T00:00:00.000Z',
          },
        ],
      })
    })

    getPodcastEpisodesMock.mockResolvedValue([])

    const wrapper = createWrapper()
    const { rerender } = render(<PodcastShowPage />, { wrapper })

    await waitFor(() => expect(deferredByCountry.has('us')).toBe(true))

    routeCountry = 'jp'
    rerender(<PodcastShowPage />)

    await waitFor(() => expect(deferredByCountry.has('jp')).toBe(true))

    deferredByCountry.get('jp')?.resolve({
      podcastItunesId: '123',
      collectionName: 'JP Podcast',
      artistName: 'JP Author',
      feedUrl: 'https://example.com/jp/feed.xml',
      artworkUrl600: 'https://example.com/jp/art-600.jpg',
      artworkUrl100: 'https://example.com/jp/art-100.jpg',
      genres: ['Tech'],
      collectionViewUrl: '',
    })

    await waitFor(() => expect(screen.queryByText('JP Podcast')).not.toBeNull())

    const oldSignal = deferredByCountry.get('us')?.signal
    expect(oldSignal?.aborted).toBe(true)

    deferredByCountry.get('us')?.resolve({
      podcastItunesId: '123',
      collectionName: 'US Podcast',
      artistName: 'US Author',
      feedUrl: 'https://example.com/us/feed.xml',
      artworkUrl600: 'https://example.com/us/art-600.jpg',
      artworkUrl100: 'https://example.com/us/art-100.jpg',
      genres: ['Tech'],
      collectionViewUrl: '',
    })

    await waitFor(() => expect(screen.queryByText('JP Podcast')).not.toBeNull())
    expect(screen.queryByText('US Podcast')).toBeNull()
  })
})
