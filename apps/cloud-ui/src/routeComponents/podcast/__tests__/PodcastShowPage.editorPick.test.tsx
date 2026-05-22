import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DISCOVERY_TEST_ROUTE, discoveryUrl } from '../../../__tests__/constants'
import { createQueryClientHarness, createQueryClientWrapper } from '../../../__tests__/queryClient'
import { server } from '../../../__tests__/setup'
import {
  makeEpisode,
  makePodcast,
  makePodcastEpisodes,
} from '../../../lib/discovery/__tests__/fixtures'
import { getPodcastEpisodesCacheEntries } from '../../../lib/discovery/episodeCache'
import PodcastEpisodesPage from '../PodcastEpisodesPage'
import PodcastShowPage from '../PodcastShowPage'

let podcastLookupHits = 0
let episodeListHits = 0
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

vi.mock('react-virtuoso', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  Virtuoso: ({ data, itemContent }: any) => (
    <div data-testid="mock-virtuoso">
      {/* biome-ignore lint/suspicious/noExplicitAny: test mock */}
      {data.map((item: any, index: number) => (
        <div key={item.key || index}>{itemContent(index, item)}</div>
      ))}
    </div>
  ),
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

describe('PodcastShowPage editor pick path', () => {
  beforeEach(() => {
    podcastLookupHits = 0
    episodeListHits = 0
    routePodcastId = '12345'
    routeState = null

    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastByItunesId('12345')), () => {
        podcastLookupHits += 1
        return HttpResponse.json(
          makePodcast({
            podcastItunesId: '12345',
            title: 'Editor Pick Podcast',
            artwork: 'https://example.com/show-600.jpg',
            description: 'Editor pick description',
            lastUpdateTime: 1711497600,
            episodeCount: 2,
          })
        )
      }),
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastEpisodesByItunesId('12345')), () => {
        episodeListHits += 1
        return HttpResponse.json(
          makePodcastEpisodes({
            episodes: [
              makeEpisode({
                guid: 'pi-ep-1',
                title: 'PI Episode 1',
                description: 'PI description',
                audioUrl: 'https://example.com/audio-1.mp3',
                pubDate: 1774569600,
                artworkUrl: 'https://example.com/ep-1.jpg',
                duration: 123,
              }),
            ],
          })
        )
      })
    )
  })

  it('loads editor pick show routes through PI podcast lookup and PI episode list ownership', async () => {
    render(<PodcastShowPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('Editor Pick Podcast')).not.toBeNull()
    expect(await screen.findByText('PI Episode 1')).not.toBeNull()
    expect(podcastLookupHits).toBe(1)
    expect(episodeListHits).toBe(1)
  })

  it('seeds the single PI episode-list cache family from the show-page fetch', async () => {
    const harness = createQueryClientHarness()

    render(<PodcastShowPage />, { wrapper: harness.wrapper })

    expect(await screen.findByText('PI Episode 1')).not.toBeNull()
    expect(getPodcastEpisodesCacheEntries(harness.queryClient, '12345', 'us')).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          episodes: [expect.objectContaining({ guid: 'pi-ep-1' })],
        }),
      }),
    ])
  })

  it('reuses the shared first page when navigating from show page to see-all under the paginated contract', async () => {
    const harness = createQueryClientHarness()

    const showRender = render(<PodcastShowPage />, { wrapper: harness.wrapper })

    expect(await screen.findByText('PI Episode 1')).not.toBeNull()
    expect(episodeListHits).toBe(1)
    expect(getPodcastEpisodesCacheEntries(harness.queryClient, '12345', 'us')).toHaveLength(1)

    showRender.unmount()

    render(<PodcastEpisodesPage />, { wrapper: harness.wrapper })

    expect(await screen.findByText('PI Episode 1')).not.toBeNull()
    expect(episodeListHits).toBe(1)
    expect(getPodcastEpisodesCacheEntries(harness.queryClient, '12345', 'us')).toHaveLength(1)
  })

  it('still performs authoritative PI lookup when an editor-pick snapshot exists', async () => {
    routeState = {
      editorPickSnapshot: {
        title: 'Snapshot Podcast',
        author: 'Host',
        artwork: 'https://example.com/show-600.jpg',
        description: 'Snapshot description',
        lastUpdateTime: 1711497600,
        podcastItunesId: '12345',
        genres: ['Technology'],
        episodeCount: 2,
        language: 'en',
      },
    }

    render(<PodcastShowPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('Snapshot Podcast')).not.toBeNull()
    expect(await screen.findByText('PI Episode 1')).not.toBeNull()
    expect(podcastLookupHits).toBe(1)
    expect(episodeListHits).toBe(1)
  })

  it('degrades only the episodes section when the PI episode list fetch fails', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastEpisodesByItunesId('12345')), () => {
        episodeListHits += 1
        return HttpResponse.error()
      })
    )

    render(<PodcastShowPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('Editor Pick Podcast')).not.toBeNull()
    expect(await screen.findByText('errorPodcastUnavailable')).not.toBeNull()
    expect(screen.queryByText('Editor pick description')).not.toBeNull()
    expect(podcastLookupHits).toBe(1)
    expect(episodeListHits).toBe(1)
  })
})
