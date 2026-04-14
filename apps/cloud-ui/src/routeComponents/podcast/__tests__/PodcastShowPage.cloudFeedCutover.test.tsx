import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../__tests__/setup'
import PodcastShowPage from '../PodcastShowPage'

let appleLookupHits = 0
let directFeedHits = 0

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
  useParams: () => ({ country: 'us', id: '123' }),
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: vi.fn(),
  }),
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

describe('PodcastShowPage 005c same-origin feed cutover', () => {
  beforeEach(() => {
    appleLookupHits = 0
    directFeedHits = 0
    server.use(
      http.get('https://itunes.apple.com/lookup', () => {
        appleLookupHits += 1
        return HttpResponse.json({ resultCount: 0, results: [] })
      }),
      http.get('https://example.com/feed.xml', () => {
        directFeedHits += 1
        return new HttpResponse('unexpected direct feed call', { status: 500 })
      }),
      http.get(
        'http://localhost:3000/api/v1/discovery/podcast-index/podcast-byitunesid',
        ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get('podcastItunesId')).toBe('123')

          return HttpResponse.json({
            podcastItunesId: '123',
            collectionName: 'Cloud Feed Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/cloud-feed-podcast',
            genres: ['Technology'],
            trackCount: 2,
          })
        }
      ),
      http.get('http://localhost:3000/api/v1/discovery/feed', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('url')).toBe('https://example.com/feed.xml')

        return HttpResponse.json({
          title: 'Cloud Feed Podcast',
          description: 'Backend-owned feed',
          artworkUrl: 'https://example.com/feed-art.jpg',
          episodes: [
            {
              id: 'ep-1',
              title: 'Episode 1',
              description: 'Episode description',
              audioUrl: 'https://example.com/audio-1.mp3',
              pubDate: '2026-03-27T00:00:00.000Z',
            },
          ],
        })
      })
    )
  })

  it('renders through same-origin lookup and feed endpoints without direct Apple or RSS calls', async () => {
    render(<PodcastShowPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('Cloud Feed Podcast')).not.toBeNull()
    expect(await screen.findByText('Episode 1')).not.toBeNull()
    expect(appleLookupHits).toBe(0)
    expect(directFeedHits).toBe(0)
  })
})
