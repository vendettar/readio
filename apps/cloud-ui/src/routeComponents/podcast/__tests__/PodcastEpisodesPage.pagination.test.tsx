import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Podcast } from '../../../lib/discovery'
import { normalizeFeedUrl } from '../../../lib/discovery/feedUrl'
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
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
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

// A more capable Virtuoso mock that exposes its callbacks for testing
// biome-ignore lint/suspicious/noExplicitAny: necessary for capturing props in mock
let virtuosoCallbacks: any = {}
vi.mock('react-virtuoso', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: necessary for mock
  Virtuoso: (props: any) => {
    virtuosoCallbacks = props
    return <div data-testid="mock-virtuoso">Virtuoso Mock</div>
  },
}))

describe('PodcastEpisodesPage Pagination Gating', () => {
  const mockFetchNextPage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    virtuosoCallbacks = {}

    // Default mock implementation
    // biome-ignore lint/suspicious/noExplicitAny: necessary for mocking hook
    ;(useInfiniteQuery as any).mockImplementation(() => ({
      data: {
        pages: [
          {
            episodes: Array.from({ length: 20 }).map((_, i) => ({
              episodeGuid: `ep-${i}`,
              title: `Episode ${i}`,
              pubDate: '2025-01-01',
            })),
          },
        ],
      },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    }))

    // biome-ignore lint/suspicious/noExplicitAny: necessary for mocking hook
    ;(useQuery as any).mockImplementation(({ queryKey }: any) => {
      if (queryKey[1] === 'podcast-detail') {
        return {
          data: {
            title: 'Test Podcast',
            feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
            podcastItunesId: '123',
            author: 'Test Author',
            artwork: 'https://example.com/art.jpg',
            description: 'Test description',
            genres: [],
          } satisfies Podcast,
          isLoading: false,
        }
      }
      return { data: undefined, isLoading: false }
    })

    // Mock scrollContainer state to unblock rendering
    const originalUseState = React.useState
    // biome-ignore lint/suspicious/noExplicitAny: necessary for spying on useState
    vi.spyOn(React, 'useState').mockImplementation(((initialValue: any) => {
      if (initialValue === null) {
        return [{ current: true }, vi.fn()]
      }
      return originalUseState(initialValue)
      // biome-ignore lint/suspicious/noExplicitAny: necessary for mock
    }) as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[P1] does NOT fetch next page on initial mount even if at the bottom', async () => {
    render(<PodcastEpisodesPage />)
    expect(await screen.findByTestId('mock-virtuoso')).toBeDefined()

    // Simulate Virtuoso reporting it's at the end of the list immediately
    // (This mimics the behavior of starting with cached data that fits the screen)
    virtuosoCallbacks.rangeChanged({ endIndex: 19 })

    expect(mockFetchNextPage).not.toHaveBeenCalled()
  })

  it('[P1] fetches next page after user performs a scroll and hits the bottom', async () => {
    render(<PodcastEpisodesPage />)
    expect(await screen.findByTestId('mock-virtuoso')).toBeDefined()

    // 1. Simulate a real scroll event on the container
    const container =
      screen.getByTestId('mock-virtuoso').parentElement?.parentElement?.parentElement
    if (container) {
      fireEvent.scroll(container)
    }

    // 2. Now simulate Virtuoso reaching the end
    // The endIndex should match listRows.length - 1
    // (20 episodes + 1 year header = 21 items total, last index is 20)
    virtuosoCallbacks.rangeChanged({ endIndex: 20 })

    expect(mockFetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('[P1] does NOT repeat fetch requests while a fetch is already in progress', async () => {
    // Override mock to simulate fetching state
    // biome-ignore lint/suspicious/noExplicitAny: necessary for mocking hook
    ;(useInfiniteQuery as any).mockImplementation(() => ({
      data: {
        pages: [
          { episodes: [{ episodeGuid: 'ep-busy', title: 'Busy Ep', pubDate: '2025-01-01' }] },
        ],
      },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: true, // Fetching is active
      fetchNextPage: mockFetchNextPage,
    }))

    render(<PodcastEpisodesPage />)

    // Simulate scroll and range change
    const container =
      screen.getByTestId('mock-virtuoso').parentElement?.parentElement?.parentElement
    if (container) fireEvent.scroll(container)

    virtuosoCallbacks.rangeChanged({ endIndex: 100 }) // Far beyond any limit

    expect(mockFetchNextPage).not.toHaveBeenCalled()
  })

  it('[P1] does NOT fetch when hasNextPage is false', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: necessary for mocking hook
    ;(useInfiniteQuery as any).mockImplementation(() => ({
      data: {
        pages: [
          { episodes: [{ episodeGuid: 'ep-none', title: 'Last Ep', pubDate: '2025-01-01' }] },
        ],
      },
      isLoading: false,
      hasNextPage: false, // No more pages
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    }))

    render(<PodcastEpisodesPage />)

    const container =
      screen.getByTestId('mock-virtuoso').parentElement?.parentElement?.parentElement
    if (container) fireEvent.scroll(container)

    virtuosoCallbacks.rangeChanged({ endIndex: 100 })

    expect(mockFetchNextPage).not.toHaveBeenCalled()
  })
})
