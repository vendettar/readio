import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../__tests__/setup'
import {
  buildPodcastFeedQueryKey,
  buildPodcastLookupQueryKey,
} from '../../../lib/discovery/podcastQueryContract'
import PodcastShowPage from '../PodcastShowPage'

let feedHits = 0
let piLookupHits = 0

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

describe('PodcastShowPage hybrid hydration (instruction 023/025)', () => {
  beforeEach(() => {
    feedHits = 0
    piLookupHits = 0
  })

  describe('hydration skipped - not_truncated', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get('id')).toBe('123')
          expect(url.searchParams.get('country')).toBe('us')

          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'Full RSS Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/full-rss/id123',
            genres: ['Technology'],
            trackCount: 15,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', ({ request }) => {
          feedHits += 1
          const url = new URL(request.url)
          expect(url.searchParams.get('url')).toBe('https://example.com/feed.xml')

          return HttpResponse.json({
            title: 'Full RSS Podcast',
            description: 'A podcast with full RSS feed',
            artworkUrl: 'https://example.com/feed-art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'Episode 1',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
              {
                id: 'ep-2',
                title: 'Episode 2',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-2.mp3',
                pubDate: '2026-03-20T00:00:00.000Z',
              },
              {
                id: 'ep-3',
                title: 'Episode 3',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-3.mp3',
                pubDate: '2026-03-13T00:00:00.000Z',
              },
              {
                id: 'ep-4',
                title: 'Episode 4',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-4.mp3',
                pubDate: '2026-03-06T00:00:00.000Z',
              },
              {
                id: 'ep-5',
                title: 'Episode 5',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-5.mp3',
                pubDate: '2026-02-27T00:00:00.000Z',
              },
              {
                id: 'ep-6',
                title: 'Episode 6',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-6.mp3',
                pubDate: '2026-02-20T00:00:00.000Z',
              },
              {
                id: 'ep-7',
                title: 'Episode 7',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-7.mp3',
                pubDate: '2026-02-13T00:00:00.000Z',
              },
              {
                id: 'ep-8',
                title: 'Episode 8',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-8.mp3',
                pubDate: '2026-02-06T00:00:00.000Z',
              },
              {
                id: 'ep-9',
                title: 'Episode 9',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-9.mp3',
                pubDate: '2026-01-30T00:00:00.000Z',
              },
              {
                id: 'ep-10',
                title: 'Episode 10',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-10.mp3',
                pubDate: '2026-01-23T00:00:00.000Z',
              },
            ],
          })
        })
      )
    })

    it('should NOT call PodcastIndex when RSS has 10 episodes and trackCount is 15 (rssCount >= 10)', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('Full RSS Podcast')).not.toBeNull()

      expect(feedHits).toBe(1)
      expect(piLookupHits).toBe(0)
    })
  })

  describe('hydration applied - RSS truncated', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get('id')).toBe('123')
          expect(url.searchParams.get('country')).toBe('us')

          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'Truncated RSS Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/truncated/id123',
            genres: ['Technology'],
            trackCount: 50,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', ({ request }) => {
          feedHits += 1
          const url = new URL(request.url)
          expect(url.searchParams.get('url')).toBe('https://example.com/feed.xml')

          return HttpResponse.json({
            title: 'Truncated RSS Podcast',
            description: 'A podcast with truncated RSS feed',
            artworkUrl: 'https://example.com/feed-art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'RSS Episode 1',
                description: 'Latest episode',
                audioUrl: 'https://example.com/rss-audio-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
              {
                id: 'ep-2',
                title: 'RSS Episode 2',
                description: 'Desc',
                audioUrl: 'https://example.com/rss-audio-2.mp3',
                pubDate: '2026-03-20T00:00:00.000Z',
              },
              {
                id: 'ep-3',
                title: 'RSS Episode 3',
                description: 'Desc',
                audioUrl: 'https://example.com/rss-audio-3.mp3',
                pubDate: '2026-03-13T00:00:00.000Z',
              },
            ],
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', ({ request }) => {
          piLookupHits += 1
          const url = new URL(request.url)
          expect(url.searchParams.get('itunesId')).toBe('123')
          expect(url.searchParams.get('limit')).toBe('50')

          return HttpResponse.json(
            Array.from({ length: 50 }, (_, i) => ({
              id: `pi-ep-${i + 1}`,
              title: `PodcastIndex Episode ${i + 1}`,
              description: `Episode description from PodcastIndex ${i + 1}`,
              audioUrl: `https://example.com/pi-audio-${i + 1}.mp3`,
              pubDate: new Date(2026, 0, 1 + i).toISOString(),
              artworkUrl: 'https://example.com/pi-art.jpg',
              duration: 1800000,
            }))
          )
        })
      )
    })

    it('should call PodcastIndex when RSS has 3 episodes and trackCount is 50 (rssCount < 10 and rssCount/trackCount < 0.8)', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('Truncated RSS Podcast')).not.toBeNull()
      expect(await screen.findByText('RSS Episode 1')).not.toBeNull()
      expect(await screen.findByText('PodcastIndex Episode 47')).not.toBeNull()
    })
  })

  describe('hydration skipped - missing iTunes id identity', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get('id')).toBe('123')

          return HttpResponse.json({
            collectionName: 'No iTunes ID Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            trackCount: 50,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', () => {
          feedHits += 1
          return HttpResponse.json({
            title: 'No iTunes ID Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/feed-art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'Episode 1',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
            ],
          })
        })
      )
    })

    it('should NOT call PodcastIndex lookup when the show lacks an iTunes id', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('No iTunes ID Podcast')).not.toBeNull()

      expect(feedHits).toBe(1)
      expect(piLookupHits).toBe(0)
    })
  })

  describe('hydration applied - fallback to route id when providerPodcastId is absent', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', () =>
          HttpResponse.json({
            collectionName: 'Top Podcasts Identity Fallback',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 25,
          })
        ),
        http.get('http://localhost:3000/api/v1/discovery/feed', () => {
          feedHits += 1
          return HttpResponse.json({
            title: 'Top Podcasts Identity Fallback',
            description: 'Desc',
            artworkUrl: 'https://example.com/feed-art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'RSS Episode 1',
                description: 'Desc',
                audioUrl: 'https://example.com/rss-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
              {
                id: 'ep-2',
                title: 'RSS Episode 2',
                description: 'Desc',
                audioUrl: 'https://example.com/rss-2.mp3',
                pubDate: '2026-03-20T00:00:00.000Z',
              },
              {
                id: 'ep-3',
                title: 'RSS Episode 3',
                description: 'Desc',
                audioUrl: 'https://example.com/rss-3.mp3',
                pubDate: '2026-03-13T00:00:00.000Z',
              },
            ],
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', ({ request }) => {
          piLookupHits += 1
          const url = new URL(request.url)
          expect(url.searchParams.get('itunesId')).toBe('123')

          return HttpResponse.json([
            {
              id: 'pi-ep-older',
              title: 'PodcastIndex Older Episode',
              description: 'Older',
              audioUrl: 'https://example.com/pi-older.mp3',
              pubDate: '2026-01-01T00:00:00.000Z',
            },
          ])
        })
      )
    })

    it('should fall back to the route iTunes id when providerPodcastId is absent', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('Top Podcasts Identity Fallback')).not.toBeNull()
      expect(await screen.findByText('PodcastIndex Older Episode')).not.toBeNull()
      expect(piLookupHits).toBe(1)
    })
  })

  describe('hydration skipped - apple_total not greater than rss', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', ({ request: _ }) => {
          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'PodcastIndex Less Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 3,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', ({ request: _ }) => {
          feedHits += 1

          return HttpResponse.json({
            title: 'PodcastIndex Less Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'Episode 1',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
              {
                id: 'ep-2',
                title: 'Episode 2',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-2.mp3',
                pubDate: '2026-03-20T00:00:00.000Z',
              },
            ],
          })
        })
      )
    })

    it('should NOT call PodcastIndex lookup when trackCount <= rssCount', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('PodcastIndex Less Podcast')).not.toBeNull()

      expect(feedHits).toBe(1)
      expect(piLookupHits).toBe(0)
    })
  })

  describe('hydration skipped - genuinely small catalog', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', () => {
          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'Small Catalog Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 2,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', () => {
          feedHits += 1

          return HttpResponse.json({
            title: 'Small Catalog Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'Episode 1',
                description: 'Desc',
                audioUrl: 'https://example.com/audio-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
            ],
          })
        })
      )
    })

    it('should NOT call PodcastIndex lookup when the catalog is genuinely small (1 of 2)', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('Small Catalog Podcast')).not.toBeNull()

      expect(feedHits).toBe(1)
      expect(piLookupHits).toBe(0)
    })
  })

  describe('hydration failed - fetch error should be graceful', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', ({ request: _ }) => {
          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'Graceful Fail Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 50,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', ({ request: _ }) => {
          feedHits += 1

          return HttpResponse.json({
            title: 'Graceful Fail Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'RSS Episode 1',
                description: 'Latest',
                audioUrl: 'https://example.com/rss-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
            ],
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', () => {
          piLookupHits += 1
          return new HttpResponse(null, { status: 500 })
        })
      )
    })

    it('should still show RSS episodes when PodcastIndex lookup fails', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('Graceful Fail Podcast')).not.toBeNull()
      expect(await screen.findByText('RSS Episode 1')).not.toBeNull()

      expect(feedHits).toBe(1)
      expect(piLookupHits).toBe(1)
    })
  })

  describe('hydration skipped - supplementary result adds no new episodes', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', () => {
          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'No Gain Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 50,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', () => {
          feedHits += 1

          return HttpResponse.json({
            title: 'No Gain Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/art.jpg',
            episodes: [
              {
                id: 'rss-1',
                title: 'RSS Episode 1',
                description: 'Latest',
                audioUrl: 'https://example.com/rss-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
              {
                id: 'rss-2',
                title: 'RSS Episode 2',
                description: 'Second',
                audioUrl: 'https://example.com/rss-2.mp3',
                pubDate: '2026-03-20T00:00:00.000Z',
              },
              {
                id: 'rss-3',
                title: 'RSS Episode 3',
                description: 'Third',
                audioUrl: 'https://example.com/rss-3.mp3',
                pubDate: '2026-03-13T00:00:00.000Z',
              },
            ],
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', () => {
          piLookupHits += 1
          return HttpResponse.json([
            {
              id: 'apple-dup-1',
              title: 'PodcastIndex Duplicate Episode 1',
              description: 'Dup 1',
              audioUrl: 'https://example.com/rss-1.mp3',
              pubDate: '2026-03-27T00:00:00.000Z',
              artworkUrl: 'https://example.com/apple-art.jpg',
              duration: 1800000,
            },
            {
              id: 'apple-dup-2',
              title: 'PodcastIndex Duplicate Episode 2',
              description: 'Dup 2',
              audioUrl: 'https://example.com/rss-2.mp3',
              pubDate: '2026-03-20T00:00:00.000Z',
              artworkUrl: 'https://example.com/apple-art.jpg',
              duration: 1800000,
            },
          ])
        })
      )
    })

    it('should keep the RSS list unchanged when PodcastIndex hydration adds no new episodes', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('No Gain Podcast')).not.toBeNull()
      expect(await screen.findByText('RSS Episode 1')).not.toBeNull()
      expect(await screen.findByText('RSS Episode 2')).not.toBeNull()
      expect(await screen.findByText('RSS Episode 3')).not.toBeNull()
      expect(screen.queryByText('PodcastIndex Duplicate Episode 1')).toBeNull()
      expect(screen.queryByText('PodcastIndex Duplicate Episode 2')).toBeNull()

      expect(feedHits).toBe(1)
      expect(piLookupHits).toBe(1)
    })
  })

  describe('deduplication by normalized audioUrl', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', () => {
          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'Dedupe Test Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 25,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', () => {
          return HttpResponse.json({
            title: 'Dedupe Test Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'RSS Episode 1',
                description: 'Latest',
                audioUrl: 'https://example.com/AUDIO-1.MP3?UTM_SOURCE=RSS',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
            ],
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', () => {
          piLookupHits += 1
          return HttpResponse.json([
            {
              id: 'apple-ep-2',
              title: 'PodcastIndex Episode 2',
              description: 'Episode 2',
              audioUrl: 'https://example.com/apple-audio-2.mp3',
              pubDate: '2026-03-20T00:00:00.000Z',
              artworkUrl: 'https://example.com/apple-art.jpg',
              duration: 1800000,
            },
            {
              id: 'apple-dup',
              title: 'PodcastIndex Duplicate Episode',
              description: 'This should be deduplicated',
              audioUrl: 'https://example.com/audio-1.mp3',
              pubDate: '2026-03-27T00:00:00.000Z',
              artworkUrl: 'https://example.com/art.jpg',
              duration: 1800000,
            },
          ])
        })
      )
    })

    it('should deduplicate episodes by normalized audioUrl', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('Dedupe Test Podcast')).not.toBeNull()
      expect(await screen.findByText('RSS Episode 1')).not.toBeNull()
      expect(await screen.findByText('PodcastIndex Episode 2')).not.toBeNull()
    })
  })

  describe('deduplication by GUID fallback identity', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', () => {
          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'GUID Dedupe Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 25,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', () => {
          return HttpResponse.json({
            title: 'GUID Dedupe Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/art.jpg',
            episodes: [
              {
                id: 'shared-guid-1',
                title: 'RSS Episode 1',
                description: 'Latest',
                audioUrl: 'https://example.com/rss-audio-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
            ],
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', () => {
          piLookupHits += 1
          return HttpResponse.json([
            {
              id: 'shared-guid-1',
              title: 'PodcastIndex Duplicate By GUID',
              description: 'Same GUID, different audio URL',
              audioUrl: 'https://cdn.example.com/different-audio-1.mp3',
              pubDate: '2026-03-27T00:00:00.000Z',
              artworkUrl: 'https://example.com/apple-art.jpg',
              duration: 1800000,
            },
            {
              id: 'pi-ep-2',
              title: 'PodcastIndex Unique Episode',
              description: 'Unique',
              audioUrl: 'https://example.com/apple-audio-2.mp3',
              pubDate: '2026-03-20T00:00:00.000Z',
              artworkUrl: 'https://example.com/apple-art.jpg',
              duration: 1800000,
            },
          ])
        })
      )
    })

    it('should deduplicate episodes by GUID when audio URLs differ', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('GUID Dedupe Podcast')).not.toBeNull()
      expect(await screen.findByText('RSS Episode 1')).not.toBeNull()
      expect(await screen.findByText('PodcastIndex Unique Episode')).not.toBeNull()
      expect(screen.queryByText('PodcastIndex Duplicate By GUID')).toBeNull()
    })
  })

  describe('hydration applied - uses Cloud lookup ceiling of 300', () => {
    beforeEach(() => {
      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', () => {
          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'Large History Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 280,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', () => {
          return HttpResponse.json({
            title: 'Large History Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'RSS Episode 1',
                description: 'Latest',
                audioUrl: 'https://example.com/rss-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
            ],
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', ({ request }) => {
          piLookupHits += 1
          const url = new URL(request.url)
          expect(url.searchParams.get('itunesId')).toBe('123')
          expect(url.searchParams.get('limit')).toBe('280')
          return HttpResponse.json([
            {
              id: 'apple-older',
              title: 'PodcastIndex Older Episode',
              description: 'Older',
              audioUrl: 'https://example.com/apple-older.mp3',
              pubDate: '2026-01-01T00:00:00.000Z',
              artworkUrl: 'https://example.com/apple-art.jpg',
              duration: 1800000,
            },
          ])
        })
      )
    })

    it('should request up to 300 supplementary episodes, not 200', async () => {
      render(<PodcastShowPage />, { wrapper: createWrapper() })

      expect(await screen.findByText('Large History Podcast')).not.toBeNull()
      expect(await screen.findByText('PodcastIndex Older Episode')).not.toBeNull()
      expect(piLookupHits).toBe(1)
    })
  })

  describe('hydration cache invalidation when trackCount drops', () => {
    beforeEach(() => {
      let lookupCalls = 0

      server.use(
        http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', () => {
          lookupCalls += 1
          if (lookupCalls === 1) {
            return HttpResponse.json({
              providerPodcastId: 123,
              collectionName: 'Track Count Changes Podcast',
              artistName: 'Host',
              artworkUrl100: 'https://example.com/art-100.jpg',
              artworkUrl600: 'https://example.com/art-600.jpg',
              feedUrl: 'https://example.com/feed.xml',
              collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
              genres: ['Technology'],
              trackCount: 50,
            })
          }

          return HttpResponse.json({
            providerPodcastId: 123,
            collectionName: 'Track Count Changes Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/art-100.jpg',
            artworkUrl600: 'https://example.com/art-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/us/podcast/test/id123',
            genres: ['Technology'],
            trackCount: 3,
          })
        }),
        http.get('http://localhost:3000/api/v1/discovery/feed', () =>
          HttpResponse.json({
            title: 'Track Count Changes Podcast',
            description: 'Desc',
            artworkUrl: 'https://example.com/art.jpg',
            episodes: [
              {
                id: 'ep-1',
                title: 'RSS Episode 1',
                description: 'Latest',
                audioUrl: 'https://example.com/rss-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
              },
              {
                id: 'ep-2',
                title: 'RSS Episode 2',
                description: 'Second',
                audioUrl: 'https://example.com/rss-2.mp3',
                pubDate: '2026-03-20T00:00:00.000Z',
              },
              {
                id: 'ep-3',
                title: 'RSS Episode 3',
                description: 'Third',
                audioUrl: 'https://example.com/rss-3.mp3',
                pubDate: '2026-03-13T00:00:00.000Z',
              },
            ],
          })
        ),
        http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', () => {
          piLookupHits += 1
          return HttpResponse.json([
            {
              id: 'apple-older',
              title: 'PodcastIndex Older Episode',
              description: 'Older',
              audioUrl: 'https://example.com/apple-older.mp3',
              pubDate: '2026-01-01T00:00:00.000Z',
              artworkUrl: 'https://example.com/apple-art.jpg',
              duration: 1800000,
            },
          ])
        })
      )
    })

    it('should stop using stale hydrated episodes when trackCount drops below the hydration threshold', async () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      })

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )

      const view = render(<PodcastShowPage />, { wrapper })

      expect(await screen.findByText('Track Count Changes Podcast')).not.toBeNull()
      expect(await screen.findByText('PodcastIndex Older Episode')).not.toBeNull()
      expect(piLookupHits).toBe(1)

      await queryClient.invalidateQueries({
        queryKey: buildPodcastLookupQueryKey('123', 'us'),
        refetchType: 'active',
      })
      await queryClient.invalidateQueries({
        queryKey: buildPodcastFeedQueryKey('https://example.com/feed.xml'),
        refetchType: 'active',
      })

      view.rerender(<PodcastShowPage />)

      await waitFor(() => {
        expect(screen.queryByText('PodcastIndex Older Episode')).toBeNull()
      })
      expect(await screen.findByText('RSS Episode 1')).not.toBeNull()
      expect(piLookupHits).toBe(1)
    })
  })
})
