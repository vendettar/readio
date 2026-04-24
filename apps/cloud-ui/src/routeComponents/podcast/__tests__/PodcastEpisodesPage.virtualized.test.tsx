import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastEpisodesPage from '../PodcastEpisodesPage'

// Mock dependencies
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useInfiniteQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({
    getQueryData: vi.fn(() => undefined),
    getQueryState: vi.fn(() => undefined),
  })),
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: vi.fn(() => ({ id: '123', country: 'us' })),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: vi.fn(),
    fetchPodcastFeed: vi.fn(),
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

// Mock EpisodeRow so we can verify properties (like isLast) easily
vi.mock('../../../components/EpisodeRow/EpisodeRow', () => ({
  EpisodeRow: ({ episode, isLast }: any) => (
    <div data-testid={`episode-row-${episode.episodeGuid}`} data-is-last={isLast ? 'true' : 'false'}>
      {episode.title}
    </div>
  ),
}))

// Mock normal Virtuoso to just render the itemContent sequentially for all data.
// We intercept customScrollParent safely.
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent }: any) => (
    <div data-testid="mock-virtuoso">
      {data.map((item: any, index: number) => (
        <div key={item.key} data-testid={`virtuoso-item-${index}`}>
          {itemContent(index, item)}
        </div>
      ))}
    </div>
  ),
}))

describe('PodcastEpisodesPage virtualized rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useInfiniteQuery as any).mockImplementation((args: any) => (useQuery as any)(args))

    // We mock setScrollContainer by returning a fake container on render,
    // which unblocks the scrollContainer && <Virtuoso/> condition.
    const originalUseState = React.useState
    vi.spyOn(React, 'useState').mockImplementation(((initialValue: any) => {
      if (initialValue === null) {
        // mock scrollContainer state
        return [{ current: true }, vi.fn()]
      }
      return originalUseState(initialValue)
    }) as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders flat rows with year headers and correctly assigns isLast', async () => {
    ;(useQuery as any).mockImplementation(({ queryKey }: any) => {
      if (queryKey[1] === 'podcast-detail') {
        return { data: { title: 'Test Podcast', feedUrl: 'https://example.com/feed.xml' }, isLoading: false }
      }
      if (queryKey[1] === 'feed') {
        return {
          data: {
            pages: [
              {
                episodes: [
                  { episodeGuid: 'ep1', title: 'Episode 1', pubDate: '2025-01-01' },
                  { episodeGuid: 'ep2', title: 'Episode 2', pubDate: '2025-01-01' },
                  { episodeGuid: 'ep3', title: 'Episode 3', pubDate: '2024-01-01' },
                ],
              },
            ],
          },
          isLoading: false,
        }
      }
      return { data: undefined, isLoading: false }
    })

    render(<PodcastEpisodesPage />)

    // Wait for feed to "load"
    expect(await screen.findByText(/2025/)).toBeDefined()
    expect(await screen.findByText(/2024/)).toBeDefined()

    // Assert that episode rows exist
    const row1 = screen.getByTestId('episode-row-ep1')
    const row2 = screen.getByTestId('episode-row-ep2')
    const row3 = screen.getByTestId('episode-row-ep3')

    expect(row1).toBeDefined()
    expect(row2).toBeDefined()
    expect(row3).toBeDefined()

    // Assert isLast: ep1 is NOT last in 2025, ep2 IS last in 2025, ep3 IS last in 2024
    expect(row1.getAttribute('data-is-last')).toBe('false')
    expect(row2.getAttribute('data-is-last')).toBe('true')
    expect(row3.getAttribute('data-is-last')).toBe('true')
  })

  it('renders strictly in the canonical order provided by the feed without sorting, even if interleaved', async () => {
    ;(useQuery as any).mockImplementation(({ queryKey }: any) => {
      if (queryKey[1] === 'podcast-detail') {
        return { data: { title: 'Test Podcast', feedUrl: 'https://example.com/feed.xml' }, isLoading: false }
      }
      if (queryKey[1] === 'feed') {
        return {
          data: {
            pages: [
              {
                episodes: [
                  { episodeGuid: 'ep1', title: 'Ep 1 (2026)', pubDate: '2026-01-01T00:00:00Z' },
                  { episodeGuid: 'ep2', title: 'Ep 2 (2019)', pubDate: '2019-01-01T00:00:00Z' },
                  { episodeGuid: 'ep3', title: 'Ep 3 (2025)', pubDate: '2025-01-01T00:00:00Z' },
                  { episodeGuid: 'ep4', title: 'Ep 4 (2025)', pubDate: '2025-02-01T00:00:00Z' },
                ],
              },
            ],
          },
          isLoading: false,
        }
      }
      return { data: undefined, isLoading: false }
    })

    render(<PodcastEpisodesPage />)
    expect(await screen.findByTestId('mock-virtuoso')).toBeDefined()

    const virtuoso = screen.getByTestId('mock-virtuoso')

    // We expect headers and rows to appear exactly in the order:
    // Header 2026 -> Row ep1 -> Header 2019 -> Row ep2 -> Header 2025 -> Row ep3 -> Row ep4
    const childrenText = Array.from(virtuoso.children).map(node => node.textContent)

    expect(childrenText[0]).toContain('2026')
    expect(childrenText[1]).toContain('Ep 1 (2026)')

    expect(childrenText[2]).toContain('2019')
    expect(childrenText[3]).toContain('Ep 2 (2019)')

    expect(childrenText[4]).toContain('2025')
    expect(childrenText[5]).toContain('Ep 3 (2025)')
    expect(childrenText[6]).toContain('Ep 4 (2025)')

    // Verify isLastInYear logic:
    // ep1 is last in its 2026 group (next is 2019)
    expect(screen.getByTestId('episode-row-ep1').getAttribute('data-is-last')).toBe('true')
    // ep2 is last in its 2019 group (next is 2025)
    expect(screen.getByTestId('episode-row-ep2').getAttribute('data-is-last')).toBe('true')
    // ep3 is NOT last in 2025 (next is ep4, also 2025)
    expect(screen.getByTestId('episode-row-ep3').getAttribute('data-is-last')).toBe('false')
    // ep4 is last (end of list)
    expect(screen.getByTestId('episode-row-ep4').getAttribute('data-is-last')).toBe('true')
  })

  it('regression test for CBC case: 1x2026, 1x2025, 7x2019 (9 total)', async () => {
    // Generate 7 items for 2019
    const episodes2019 = Array.from({ length: 7 }).map((_, i) => ({
      episodeGuid: `ep-2019-${i}`,
      title: `2019 Episode ${i}`,
      // 16, 15, 14, 13, 12, 11, 10
      pubDate: `2019-11-1${6 - i}T19:00:00Z`,
    }))

    ;(useQuery as any).mockImplementation(({ queryKey }: any) => {
      if (queryKey[1] === 'podcast-detail') {
        return { data: { title: 'CBC Podcast', feedUrl: 'https://cbc.com/feed.xml' }, isLoading: false }
      }
      if (queryKey[1] === 'feed') {
        return {
          data: {
            pages: [
              {
                episodes: [
                  { episodeGuid: 'ep-2026', title: 'The next season', pubDate: '2026-02-03T00:10:00Z' },
                  { episodeGuid: 'ep-2025', title: 'Coming back', pubDate: '2025-06-05T00:10:00Z' },
                  ...episodes2019,
                ],
              },
            ],
          },
          isLoading: false,
        }
      }
      return { data: undefined, isLoading: false }
    })

    render(<PodcastEpisodesPage />)

    // Wait for the render to complete
    expect(await screen.findByTestId('mock-virtuoso')).toBeDefined()

    // Assert Headers
    expect(screen.getByText('2026')).toBeDefined()
    expect(screen.getByText('2025')).toBeDefined()
    expect(screen.getByText('2019')).toBeDefined()

    // Assert Episode 1 (2026) is present and isLast is true
    const ep2026 = screen.getByTestId('episode-row-ep-2026')
    expect(ep2026).toBeDefined()
    expect(ep2026.getAttribute('data-is-last')).toBe('true')

    // Assert Episode 2 (2025) is present and isLast is true
    const ep2025 = screen.getByTestId('episode-row-ep-2025')
    expect(ep2025).toBeDefined()
    expect(ep2025.getAttribute('data-is-last')).toBe('true')

    // Assert that ALL 7 episodes from 2019 are present
    episodes2019.forEach((ep, index) => {
      const row = screen.getByTestId(`episode-row-${ep.episodeGuid}`)
      expect(row).toBeDefined()

      // Only the very last episode of 2019 should be marked isLast
      if (index === episodes2019.length - 1) {
        expect(row.getAttribute('data-is-last')).toBe('true')
      } else {
        expect(row.getAttribute('data-is-last')).toBe('false')
      }
    })

    // Ensure exactly 9 episodes were rendered
    const episodeRows = screen.queryAllByTestId(/^episode-row-/)
    expect(episodeRows.length).toBe(9)
  })

  it('groups malformed pubDate entries into unknown-year bucket', async () => {
    ;(useQuery as any).mockImplementation(({ queryKey }: any) => {
      if (queryKey[1] === 'podcast-detail') {
        return { data: { title: 'Test Podcast', feedUrl: 'https://example.com/feed.xml' }, isLoading: false }
      }
      if (queryKey[1] === 'feed') {
        return {
          data: {
            pages: [
              {
                episodes: [
                  { episodeGuid: 'ep-valid', title: 'Episode ep-valid', pubDate: '2025-01-01' },
                  { episodeGuid: 'ep-invalid', title: 'Episode invalid', pubDate: 'not-a-date' },
                ],
              },
            ],
          },
          isLoading: false,
        }
      }
      return { data: undefined, isLoading: false }
    })

    render(<PodcastEpisodesPage />)

    expect(await screen.findByText(/2025/)).toBeDefined()
    expect(await screen.findByText(/unknownTitle/)).toBeDefined()
  })
})
