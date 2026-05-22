import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEpisode, makePodcastEpisodes } from '../../../lib/discovery/__tests__/fixtures'
import PodcastEpisodesPage from '../PodcastEpisodesPage'

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({
    getQueryData: vi.fn(() => undefined),
    getQueryState: vi.fn(() => undefined),
  })),
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: vi.fn(() => ({ id: '123', country: 'us' })),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: vi.fn(),
    fetchPodcastEpisodes: vi.fn(),
    fetchPodcastEpisodeDetail: vi.fn(),
  },
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: vi.fn((selector) =>
    selector({
      country: 'us',
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      isFavorited: vi.fn(() => false),
    })
  ),
}))

vi.mock('../../../components/EpisodeRow/EpisodeRow', () => ({
  EpisodeRow: ({
    episode,
    isLast,
  }: {
    episode: { guid?: string; title: string }
    isLast: boolean
  }) => (
    <div data-testid={`episode-row-${episode.guid}`} data-is-last={isLast ? 'true' : 'false'}>
      {episode.title}
    </div>
  ),
}))

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: Array<{ key: string }>
    itemContent: (index: number, item: { key: string }) => React.ReactNode
  }) => (
    <div data-testid="mock-virtuoso">
      {data.map((item, index) => (
        <div key={item.key} data-testid={`virtuoso-item-${index}`}>
          {itemContent(index, item)}
        </div>
      ))}
    </div>
  ),
}))

describe('PodcastEpisodesPage PI episode list ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const originalUseState = React.useState
    vi.spyOn(React, 'useState').mockImplementation(((initialValue: unknown) => {
      if (initialValue === null) {
        return [{ current: true }, vi.fn()]
      }
      return originalUseState(initialValue)
    }) as typeof React.useState)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders from the paginated same-origin episodes query without the legacy episodes useQuery', async () => {
    ;(useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        if (queryKey[1] === 'detail') {
          return {
            data: {
              title: 'Test Podcast',
              podcastItunesId: '123',
              author: 'Host',
              artwork: 'https://example.com/art.jpg',
              description: 'Podcast description',
              genres: [],
            },
            isLoading: false,
            error: null,
          }
        }

        return { data: undefined, isLoading: false, error: null }
      }
    )
    ;(useInfiniteQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        pages: [
          makePodcastEpisodes({
            episodes: [
              makeEpisode({
                guid: 'ep1',
                title: 'Episode 1',
                pubDate: 1735689600,
              }),
              makeEpisode({
                guid: 'ep2',
                title: 'Episode 2',
                pubDate: 1735689600,
              }),
              makeEpisode({
                guid: 'ep3',
                title: 'Episode 3',
                pubDate: 1704067200,
              }),
            ],
            hasMore: false,
            nextOffset: 3,
            storedTotal: 3,
          }),
        ],
      },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    })

    render(<PodcastEpisodesPage />)

    expect(await screen.findByTestId('mock-virtuoso')).toBeDefined()
    expect(screen.getByText('2025')).toBeDefined()
    expect(screen.getByText('2024')).toBeDefined()
    expect(screen.getByTestId('episode-row-ep1').getAttribute('data-is-last')).toBe('false')
    expect(screen.getByTestId('episode-row-ep2').getAttribute('data-is-last')).toBe('true')
    expect(screen.getByTestId('episode-row-ep3').getAttribute('data-is-last')).toBe('true')
  })

  it('preserves canonical upstream order from the paginated PI episode payload', async () => {
    ;(useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        if (queryKey[1] === 'detail') {
          return {
            data: {
              title: 'Test Podcast',
              podcastItunesId: '123',
              author: 'Host',
              artwork: 'https://example.com/art.jpg',
              description: 'Podcast description',
              genres: [],
            },
            isLoading: false,
            error: null,
          }
        }

        return { data: undefined, isLoading: false, error: null }
      }
    )
    ;(useInfiniteQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        pages: [
          makePodcastEpisodes({
            episodes: [
              makeEpisode({
                guid: 'ep1',
                title: 'Ep 1 (2026)',
                pubDate: 1767225600,
              }),
              makeEpisode({
                guid: 'ep2',
                title: 'Ep 2 (2019)',
                pubDate: 1546300800,
              }),
              makeEpisode({
                guid: 'ep3',
                title: 'Ep 3 (2025)',
                pubDate: 1735689600,
              }),
              makeEpisode({
                guid: 'ep4',
                title: 'Ep 4 (2025)',
                pubDate: 1738368000,
              }),
            ],
            hasMore: false,
            nextOffset: 4,
            storedTotal: 4,
          }),
        ],
      },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    })

    render(<PodcastEpisodesPage />)
    expect(await screen.findByTestId('mock-virtuoso')).toBeDefined()

    const virtuoso = screen.getByTestId('mock-virtuoso')
    const childrenText = Array.from(virtuoso.children).map((node) => node.textContent)

    expect(childrenText[0]).toContain('2026')
    expect(childrenText[1]).toContain('Ep 1 (2026)')
    expect(childrenText[2]).toContain('2019')
    expect(childrenText[3]).toContain('Ep 2 (2019)')
    expect(childrenText[4]).toContain('2025')
    expect(childrenText[5]).toContain('Ep 3 (2025)')
    expect(childrenText[6]).toContain('Ep 4 (2025)')
  })
})
