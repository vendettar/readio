import { render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../__tests__/queryClient'
import {
  makeEpisode,
  makeMinimalPodcast,
  makePodcastEpisodes,
} from '../../../lib/discovery/__tests__/fixtures'
import PodcastShowPage from '../PodcastShowPage'

const getPodcastMock = vi.fn()
const fetchPodcastEpisodesMock = vi.fn()

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

vi.mock('../../../lib/discovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/discovery')>()
  return {
    ...actual,
    default: {
      getPodcastIndexPodcastByItunesId: (...args: unknown[]) => getPodcastMock(...args),
      fetchPodcastEpisodes: (...args: unknown[]) => fetchPodcastEpisodesMock(...args),
    },
  }
})

type DeferredPodcast = {
  signal?: AbortSignal
  resolve: (value: ReturnType<typeof makeMinimalPodcast>) => void
  reject: (error: unknown) => void
}

describe('PodcastShowPage country switch cancellation', () => {
  beforeEach(() => {
    routeCountry = 'us'
    getPodcastMock.mockReset()
    fetchPodcastEpisodesMock.mockReset()
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

    fetchPodcastEpisodesMock.mockImplementation((_podcastId: string) => {
      const country = routeCountry
      return Promise.resolve(
        makePodcastEpisodes({
          episodes: [
            makeEpisode({
              guid: `${country}-ep-1`,
              title: `${country.toUpperCase()} Episode`,
              description: '',
              audioUrl: `https://example.com/${country}/audio.mp3`,
              pubDate: '2025-01-01T00:00:00.000Z',
              artworkUrl: `https://example.com/${country}/episode.jpg`,
            }),
          ],
        })
      )
    })
    const wrapper = createQueryClientWrapper()
    const { rerender } = render(<PodcastShowPage />, { wrapper })

    await waitFor(() => expect(deferredByCountry.has('us')).toBe(true))

    routeCountry = 'jp'
    rerender(<PodcastShowPage />)

    await waitFor(() => expect(deferredByCountry.has('jp')).toBe(true))

    deferredByCountry.get('jp')?.resolve({
      ...makeMinimalPodcast({
        podcastItunesId: '123',
        title: 'JP Podcast',
        author: 'JP Author',
        artwork: 'https://example.com/jp/art-600.jpg',
        genres: ['Tech'],
      }),
    })

    await waitFor(() => expect(screen.queryByText('JP Podcast')).not.toBeNull())

    const oldSignal = deferredByCountry.get('us')?.signal
    expect(oldSignal?.aborted).toBe(true)

    deferredByCountry.get('us')?.resolve({
      ...makeMinimalPodcast({
        podcastItunesId: '123',
        title: 'US Podcast',
        author: 'US Author',
        artwork: 'https://example.com/us/art-600.jpg',
        genres: ['Tech'],
      }),
    })

    await waitFor(() => expect(screen.queryByText('JP Podcast')).not.toBeNull())
    expect(screen.queryByText('US Podcast')).toBeNull()
  })
})
