import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../__tests__/setup'
import PodcastShowPage from '../PodcastShowPage'

let appleLookupHits = 0
let feedHits = 0
let piItunesLookupHits = 0
let piEpisodesHits = 0
let routePodcastId = '12345'
let routeState: unknown = null

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useLocation: () => ({ state: routeState }),
  useParams: () => ({
    country: 'us',
    id: routePodcastId,
  }),
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

describe('PodcastShowPage editor pick path', () => {
  beforeEach(() => {
    appleLookupHits = 0
    feedHits = 0
    piItunesLookupHits = 0
    piEpisodesHits = 0
    routePodcastId = '12345'
    routeState = null

    server.use(
      http.get('https://itunes.apple.com/lookup', () => {
        appleLookupHits += 1
        return HttpResponse.json({ resultCount: 0, results: [] })
      }),
      http.get(
        'http://localhost:3000/api/v1/discovery/podcast-index/podcast-byitunesid',
        ({ request }) => {
          piItunesLookupHits += 1
          const url = new URL(request.url)
          expect(url.searchParams.get('podcastItunesId')).toBe('12345')

          return HttpResponse.json({
            podcastItunesId: '12345',
            collectionName: 'Editor Pick Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/show-100.jpg',
            artworkUrl600: 'https://example.com/show-600.jpg',
            feedUrl: 'https://example.com/show-feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/editor-pick',
            genres: [{ genreId: '1', name: 'Technology' }],
            trackCount: 2,
            feedId: '4063627',
            podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
          })
        }
      ),
      http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', () => {
        piEpisodesHits += 1
        return HttpResponse.json([])
      }),
      http.get('http://localhost:3000/api/v1/discovery/feed', ({ request }) => {
        feedHits += 1
        const url = new URL(request.url)
        expect(url.searchParams.get('url')).toBe('https://example.com/show-feed.xml')

        return HttpResponse.json({
          title: 'Editor Pick Podcast',
          description: 'Feed description',
          artworkUrl: 'https://example.com/show-600.jpg',
          episodes: [
            {
              id: 'feed-ep-1',
              episodeGuid: 'feed-ep-1',
              title: 'Feed Episode 1',
              description: 'Feed description',
              audioUrl: 'https://example.com/audio-1.mp3',
              pubDate: '2026-03-27T00:00:00.000Z',
              artworkUrl: 'https://example.com/ep-1.jpg',
              duration: 123,
            },
          ],
        })
      })
    )
  })

  it('loads editor pick show routes through podcast-byitunesid then RSS', async () => {
    render(<PodcastShowPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('Editor Pick Podcast')).not.toBeNull()
    expect(await screen.findByText('Feed Episode 1')).not.toBeNull()
    expect(appleLookupHits).toBe(0)
    expect(piItunesLookupHits).toBe(1)
    expect(feedHits).toBe(1)
    expect(piEpisodesHits).toBe(0)
  })

  it('fails closed when the RSS fetch fails instead of pivoting to Apple/provider episodes', async () => {
    routeState = {
      editorPickSnapshot: {
        id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
        name: 'Editor Pick Podcast',
        artistName: 'Host',
        artworkUrl100: 'https://example.com/show-100.jpg',
        url: 'https://podcasts.apple.com/editor-pick',
        genres: [{ genreId: '1', name: 'Technology', url: '' }],
        feedUrl: 'https://example.com/show-feed.xml',
        podcastItunesId: '12345',
        podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      },
    }

    server.use(
      http.get('http://localhost:3000/api/v1/discovery/feed', () => {
        feedHits += 1
        return HttpResponse.error()
      })
    )

    render(<PodcastShowPage />, { wrapper: createWrapper() })

    expect(await screen.findByText('errorPodcastUnavailable')).not.toBeNull()
    expect(appleLookupHits).toBe(0)
    expect(piItunesLookupHits).toBe(1)
    expect(feedHits).toBe(1)
    expect(piEpisodesHits).toBe(0)
  })
})
