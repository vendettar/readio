import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DISCOVERY_TEST_ROUTE, discoveryUrl } from '../../../__tests__/constants'
import { createQueryClientHarness, createQueryClientWrapper } from '../../../__tests__/queryClient'
import { server } from '../../../__tests__/setup'
import {
  makeEpisode,
  makePodcast,
  makePodcastEpisodes,
} from '../../../lib/discovery/__tests__/fixtures'
import { writePodcastEpisodesToCache } from '../../../lib/discovery/episodeCache'
import { buildPodcastDetailQueryKey } from '../../../lib/discovery/podcastQueryContract'
import PodcastEpisodesPage from '../PodcastEpisodesPage'

let podcastLookupHits = 0
let episodeListHits = 0

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({
    country: 'us',
    id: '12345',
  }),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
    }),
}))

vi.mock('../../../components/EpisodeRow/EpisodeRow', () => ({
  EpisodeRow: ({ episode }: { episode: { title: string } }) => <div>{episode.title}</div>,
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

describe('PodcastEpisodesPage editor pick path', () => {
  beforeEach(() => {
    podcastLookupHits = 0
    episodeListHits = 0

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
            episodeCount: 3,
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
                pubDate: '2026-03-27T00:00:00Z',
              }),
              makeEpisode({
                guid: 'pi-ep-2',
                title: 'PI Episode 2',
                pubDate: '2025-03-27T00:00:00Z',
              }),
              makeEpisode({
                guid: 'pi-ep-3',
                title: 'PI Episode 3',
                pubDate: '2025-02-27T00:00:00Z',
              }),
            ],
          })
        )
      })
    )
  })

  it('loads editor pick episode lists through PI podcast lookup and PI episode list ownership', async () => {
    render(<PodcastEpisodesPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('PI Episode 1')).not.toBeNull()
    expect(await screen.findByText('PI Episode 2')).not.toBeNull()
    expect(await screen.findByText('PI Episode 3')).not.toBeNull()
    expect(podcastLookupHits).toBe(1)
    expect(episodeListHits).toBe(1)
  })

  it('fails closed when the PI episode list fetch fails', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastEpisodesByItunesId('12345')), () => {
        episodeListHits += 1
        return HttpResponse.error()
      })
    )

    render(<PodcastEpisodesPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('errorPodcastUnavailable')).not.toBeNull()
    expect(podcastLookupHits).toBe(1)
    expect(episodeListHits).toBe(1)
  })

  it('reuses the PI episode-list cache family for warm see-all navigation', async () => {
    const podcast = makePodcast({
      podcastItunesId: '12345',
      title: 'Cached Podcast',
      author: 'Host',
      lastUpdateTime: 1711497600,
      episodeCount: 2,
    })
    const harness = createQueryClientHarness({
      setup: (queryClient) => {
        queryClient.setQueryData(buildPodcastDetailQueryKey('12345', 'us'), podcast)
        writePodcastEpisodesToCache(
          queryClient,
          '12345',
          makePodcastEpisodes({
            episodes: [
              makeEpisode({
                guid: 'cached-ep-1',
                title: 'Cached Episode 1',
                pubDate: '2026-03-27T00:00:00Z',
              }),
              makeEpisode({
                guid: 'cached-ep-2',
                title: 'Cached Episode 2',
                pubDate: '2025-03-27T00:00:00Z',
              }),
            ],
          }),
          {
            country: 'us',
            authority: {
              lastUpdateTime: podcast.lastUpdateTime,
              episodeCount: podcast.episodeCount,
            },
          }
        )
      },
    })

    render(<PodcastEpisodesPage />, { wrapper: harness.wrapper })

    expect(await screen.findByText('Cached Episode 1')).not.toBeNull()
    expect(await screen.findByText('Cached Episode 2')).not.toBeNull()
    expect(podcastLookupHits).toBe(0)
    expect(episodeListHits).toBe(0)
  })
})
