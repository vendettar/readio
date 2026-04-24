import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClientHarness, createQueryClientWrapper } from '../../../__tests__/queryClient'
import { server } from '../../../__tests__/setup'
import {
  makeFeedEpisode,
  makeParsedFeed,
  makePodcast,
} from '../../../lib/discovery/__tests__/fixtures'
import { normalizeFeedUrl } from '../../../lib/discovery/feedUrl'
import { buildPodcastFeedQueryKey } from '../../../lib/discovery/podcastQueryContract'
import PodcastEpisodesPage from '../PodcastEpisodesPage'

let appleLookupHits = 0
let feedHits = 0
let piItunesLookupHits = 0
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
  useParams: () => ({
    country: 'us',
    id: '12345',
  }),
  useLocation: () => ({ state: routeState }),
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
    }),
}))

vi.mock('../../../components/EpisodeRow/EpisodeRow', () => ({
  EpisodeRow: ({ episode }: { episode: { title: string } }) => <div>{episode.title}</div>,
}))

vi.mock('react-virtuoso', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: necessary for mock
  Virtuoso: ({ data, itemContent, components, customScrollParent, rangeChanged }: any) => (
    <div data-testid="mock-virtuoso">
      {/* biome-ignore lint/suspicious/noExplicitAny: necessary for mock */}
      {data.map((item: any, index: number) => (
        <div key={item.key || index} data-testid={`virtuoso-item-${index}`}>
          {itemContent(index, item)}
        </div>
      ))}
      {components?.Footer?.()}
      <button
        type="button"
        data-testid="auto-range-end"
        onClick={() => {
          rangeChanged?.({ startIndex: 0, endIndex: data.length - 1 })
        }}
      >
        auto range end
      </button>
      <button
        type="button"
        data-testid="load-more"
        onClick={() => {
          if (customScrollParent) {
            Object.defineProperty(customScrollParent, 'scrollHeight', {
              configurable: true,
              value: 1000,
            })
            Object.defineProperty(customScrollParent, 'clientHeight', {
              configurable: true,
              value: 400,
            })
            Object.defineProperty(customScrollParent, 'scrollTop', {
              configurable: true,
              value: 620,
              writable: true,
            })
            fireEvent.scroll(customScrollParent)
          }
          rangeChanged?.({ startIndex: Math.max(0, data.length - 5), endIndex: data.length - 1 })
        }}
      >
        load more
      </button>
    </div>
  ),
}))

describe('PodcastEpisodesPage editor pick path', () => {
  beforeEach(() => {
    appleLookupHits = 0
    feedHits = 0
    piItunesLookupHits = 0
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

          return HttpResponse.json(
            makePodcast({
              podcastItunesId: '12345',
              title: 'Editor Pick Podcast',
              artwork: 'https://example.com/show-600.jpg',
              description: 'Editor pick description',
              feedUrl: normalizeFeedUrl('https://example.com/show-feed.xml'),
              lastUpdateTime: 1711497600,
              episodeCount: 2,
            })
          )
        }
      ),
      http.get('http://localhost:3000/api/v1/discovery/feed', ({ request }) => {
        feedHits += 1
        const url = new URL(request.url)
        expect(url.searchParams.get('url')).toBe('https://example.com/show-feed.xml')
        expect(url.searchParams.get('limit')).toBe('20')
        expect(url.searchParams.get('offset')).toBe('0')

        return HttpResponse.json(
          makeParsedFeed({
            title: 'Editor Pick Podcast',
            description: 'Feed description',
            artworkUrl: 'https://example.com/show-600.jpg',
            episodes: [
              makeFeedEpisode({
                episodeGuid: 'feed-ep-1',
                title: 'Feed Episode 1',
                description: 'Feed description',
                audioUrl: 'https://example.com/audio-1.mp3',
                pubDate: '2026-03-27T00:00:00.000Z',
                artworkUrl: 'https://example.com/ep-1.jpg',
                duration: 123,
              }),
            ],
          })
        )
      })
    )
  })

  it('loads editor pick episode lists through podcast-byitunesid then RSS', async () => {
    render(<PodcastEpisodesPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('Feed Episode 1')).not.toBeNull()
    expect(appleLookupHits).toBe(0)
    expect(piItunesLookupHits).toBe(1)
    expect(feedHits).toBe(1)
  })

  it('fails closed when the RSS fetch fails instead of pivoting to Apple/provider episodes', async () => {
    routeState = {
      editorPickSnapshot: {
        title: 'Editor Pick Podcast',
        author: 'Host',
        artwork: 'https://example.com/show-600.jpg',
        description: 'Editor pick description',
        feedUrl: normalizeFeedUrl('https://example.com/show-feed.xml'),
        lastUpdateTime: 1711497600,
        podcastItunesId: '12345',
        genres: ['Technology'],
        episodeCount: 2,
        language: 'en',
      },
    }

    server.use(
      http.get('http://localhost:3000/api/v1/discovery/feed', () => {
        feedHits += 1
        return HttpResponse.error()
      })
    )

    render(<PodcastEpisodesPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('errorPodcastUnavailable')).not.toBeNull()
    expect(appleLookupHits).toBe(0)
    expect(piItunesLookupHits).toBe(1)
    expect(feedHits).toBe(1)
  })

  it('keeps see all semantics by incrementally loading more pages', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/feed', async ({ request }) => {
        feedHits += 1
        const url = new URL(request.url)
        expect(url.searchParams.get('url')).toBe('https://example.com/show-feed.xml')
        const limit = Number(url.searchParams.get('limit') || '0')
        const offset = Number(url.searchParams.get('offset') || '0')
        const totalEpisodes = 40
        const startIndex = Number.isFinite(offset) ? offset : 0
        const pageSize = limit > 0 ? Math.min(limit, totalEpisodes - startIndex) : totalEpisodes

        if (offset === 20) {
          await new Promise((resolve) => setTimeout(resolve, 120))
        }

        return HttpResponse.json(
          makeParsedFeed({
            title: 'Editor Pick Podcast',
            description: 'Feed description',
            artworkUrl: 'https://example.com/show-600.jpg',
            pageInfo:
              limit > 0
                ? {
                    limit,
                    offset,
                    returned: Math.max(pageSize, 0),
                    hasMore: startIndex + Math.max(pageSize, 0) < totalEpisodes,
                  }
                : undefined,
            episodes: Array.from({ length: Math.max(pageSize, 0) }, (_, index) =>
              makeFeedEpisode({
                episodeGuid: `feed-ep-${startIndex + index + 1}`,
                title: `Feed Episode ${startIndex + index + 1}`,
                description: `Feed description ${startIndex + index + 1}`,
                audioUrl: `https://example.com/audio-${startIndex + index + 1}.mp3`,
                pubDate: '2026-03-27T00:00:00.000Z',
                artworkUrl: `https://example.com/ep-${startIndex + index + 1}.jpg`,
                duration: 123,
              })
            ),
          })
        )
      })
    )

    render(<PodcastEpisodesPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('Feed Episode 20')).not.toBeNull()
    expect(screen.queryByText('Feed Episode 21')).toBeNull()

    fireEvent.click(screen.getByTestId('load-more'))

    await waitFor(() =>
      expect(screen.queryByTestId('podcast-episodes-page-loading-more')).not.toBeNull()
    )

    await waitFor(() => expect(screen.queryByText('Feed Episode 21')).not.toBeNull())
    expect(screen.queryByText('Feed Episode 40')).not.toBeNull()
    expect(feedHits).toBe(2)

    fireEvent.click(screen.getByTestId('load-more'))

    await waitFor(() => expect(feedHits).toBe(2))
  })

  it('reuses the cached first page from show page before requesting later pages', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/feed', async ({ request }) => {
        feedHits += 1
        const url = new URL(request.url)
        expect(url.searchParams.get('url')).toBe('https://example.com/show-feed.xml')
        expect(url.searchParams.get('limit')).toBe('20')
        expect(url.searchParams.get('offset')).toBe('20')

        await new Promise((resolve) => setTimeout(resolve, 120))

        return HttpResponse.json(
          makeParsedFeed({
            title: 'Editor Pick Podcast',
            description: 'Feed description',
            artworkUrl: 'https://example.com/show-600.jpg',
            pageInfo: {
              limit: 20,
              offset: 20,
              returned: 20,
              hasMore: false,
            },
            episodes: Array.from({ length: 20 }, (_, index) =>
              makeFeedEpisode({
                episodeGuid: `feed-ep-${index + 21}`,
                title: `Feed Episode ${index + 21}`,
                description: `Feed description ${index + 21}`,
                audioUrl: `https://example.com/audio-${index + 21}.mp3`,
                pubDate: '2026-03-27T00:00:00.000Z',
                artworkUrl: `https://example.com/ep-${index + 21}.jpg`,
                duration: 123,
              })
            ),
          })
        )
      })
    )

    const harness = createQueryClientHarness({
      setup: (queryClient) => {
        queryClient.setQueryData(
          buildPodcastFeedQueryKey(normalizeFeedUrl('https://example.com/show-feed.xml'), {
            limit: 20,
            offset: 0,
          }),
          makeParsedFeed({
            title: 'Editor Pick Podcast',
            description: 'Feed description',
            artworkUrl: 'https://example.com/show-600.jpg',
            pageInfo: {
              limit: 20,
              offset: 0,
              returned: 20,
              hasMore: true,
            },
            episodes: Array.from({ length: 20 }, (_, index) =>
              makeFeedEpisode({
                episodeGuid: `feed-ep-${index + 1}`,
                title: `Feed Episode ${index + 1}`,
                description: `Feed description ${index + 1}`,
                audioUrl: `https://example.com/audio-${index + 1}.mp3`,
                pubDate: '2026-03-27T00:00:00.000Z',
                artworkUrl: `https://example.com/ep-${index + 1}.jpg`,
                duration: 123,
              })
            ),
          })
        )
      },
    })

    render(<PodcastEpisodesPage />, { wrapper: harness.wrapper })

    expect(await screen.findByText('Feed Episode 20')).not.toBeNull()
    expect(feedHits).toBe(0)

    fireEvent.click(screen.getByTestId('load-more'))

    await waitFor(() =>
      expect(screen.queryByTestId('podcast-episodes-page-loading-more')).not.toBeNull()
    )

    await waitFor(() => expect(screen.queryByText('Feed Episode 21')).not.toBeNull())
    expect(screen.queryByText('Feed Episode 40')).not.toBeNull()
    expect(feedHits).toBe(1)
  })

  it('does not auto-fetch page 2 when Virtuoso reports the last row visible before user scrolls', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/feed', async ({ request }) => {
        feedHits += 1
        const url = new URL(request.url)
        const offset = Number(url.searchParams.get('offset') || '0')

        if (offset !== 0) {
          throw new Error(`unexpected follow-up request for offset ${offset}`)
        }

        return HttpResponse.json(
          makeParsedFeed({
            title: 'Editor Pick Podcast',
            description: 'Feed description',
            artworkUrl: 'https://example.com/show-600.jpg',
            pageInfo: {
              limit: 20,
              offset: 0,
              returned: 20,
              hasMore: true,
            },
            episodes: Array.from({ length: 20 }, (_, index) =>
              makeFeedEpisode({
                episodeGuid: `feed-ep-${index + 1}`,
                title: `Feed Episode ${index + 1}`,
                description: `Feed description ${index + 1}`,
                audioUrl: `https://example.com/audio-${index + 1}.mp3`,
                pubDate: '2026-03-27T00:00:00.000Z',
                artworkUrl: `https://example.com/ep-${index + 1}.jpg`,
                duration: 123,
              })
            ),
          })
        )
      })
    )

    const harness = createQueryClientHarness({
      setup: (queryClient) => {
        queryClient.setQueryData(
          buildPodcastFeedQueryKey(normalizeFeedUrl('https://example.com/show-feed.xml'), {
            limit: 20,
            offset: 0,
          }),
          makeParsedFeed({
            title: 'Editor Pick Podcast',
            description: 'Feed description',
            artworkUrl: 'https://example.com/show-600.jpg',
            pageInfo: {
              limit: 20,
              offset: 0,
              returned: 20,
              hasMore: true,
            },
            episodes: Array.from({ length: 20 }, (_, index) =>
              makeFeedEpisode({
                episodeGuid: `feed-ep-${index + 1}`,
                title: `Feed Episode ${index + 1}`,
                description: `Feed description ${index + 1}`,
                audioUrl: `https://example.com/audio-${index + 1}.mp3`,
                pubDate: '2026-03-27T00:00:00.000Z',
                artworkUrl: `https://example.com/ep-${index + 1}.jpg`,
                duration: 123,
              })
            ),
          })
        )
      },
    })

    render(<PodcastEpisodesPage />, { wrapper: harness.wrapper })

    expect(await screen.findByText('Feed Episode 20')).not.toBeNull()
    expect(feedHits).toBe(0)

    fireEvent.click(screen.getByTestId('auto-range-end'))

    await waitFor(() => expect(feedHits).toBe(0))
    expect(screen.queryByText('Feed Episode 21')).toBeNull()
  })
})
