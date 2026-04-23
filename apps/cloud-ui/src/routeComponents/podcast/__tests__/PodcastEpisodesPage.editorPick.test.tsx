import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../__tests__/queryClient'
import { server } from '../../../__tests__/setup'
import { makeFeedEpisode, makeParsedFeed, makePodcast } from '../../../lib/discovery/__tests__/fixtures'
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
  GroupedVirtuoso: ({
    data = [],
    groupCounts = [],
    groupContent,
    itemContent,
  }: {
    data?: Array<Record<string, unknown>>
    groupCounts?: number[]
    groupContent?: (groupIndex: number) => React.ReactNode
    itemContent?: (
      index: number,
      groupIndex: number,
      item: Record<string, unknown>
    ) => React.ReactNode
  }) => {
    let flatIndex = 0
    let groupStartIndex = 0
    const groups: React.ReactNode[] = []

    for (const count of groupCounts) {
      const groupIndex = groups.length
      const firstItem = data[groupStartIndex]
      const groupKey = firstItem?.id ?? `group-${groupStartIndex}-${count}`

      const items = Array.from({ length: count }).map((_, indexInGroup) => {
        const item = data[flatIndex]
        const node = itemContent?.(flatIndex, groupIndex, item)
        const itemKey = item?.id ?? `item-${flatIndex}-${indexInGroup}`
        flatIndex += 1

        return <div key={String(itemKey)}>{node}</div>
      })

      groups.push(
        <div key={String(groupKey)}>
          <div>{groupContent?.(groupIndex)}</div>
          {items}
        </div>
      )
      groupStartIndex += count
    }

    return <div data-testid="grouped-virtuoso">{groups}</div>
  },
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
              feedUrl: 'https://example.com/show-feed.xml',
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
        feedUrl: 'https://example.com/show-feed.xml',
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
})
