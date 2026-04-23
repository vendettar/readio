import { render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFeedEpisode, makePodcast } from '../../../lib/discovery/__tests__/fixtures'
import type { FeedEpisode, Podcast } from '../../../lib/discovery/schema'
import PodcastEpisodesPage from '../PodcastEpisodesPage'

const intersectionObserverCtor = vi.fn()

let mockPodcast: Podcast | null = null
let mockEpisodes: FeedEpisode[] = []
let originalIntersectionObserver: typeof globalThis.IntersectionObserver

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ country: 'us', id: '123' }),
  useSearch: () => ({}),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[1] === 'podcast-detail') {
      return {
        data: mockPodcast,
        isLoading: false,
        error: null,
      }
    }

    if (queryKey[1] === 'feed') {
      return {
        data: {
          title: mockPodcast?.title ?? '',
          description: '',
          artworkUrl: mockPodcast?.artwork,
          episodes: mockEpisodes,
        },
        isLoading: false,
      }
    }

    return {
      data: undefined,
      isLoading: false,
      error: null,
    }
  },
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: vi.fn(),
  }),
}))

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: vi.fn(),
    fetchPodcastFeed: vi.fn(),
  },
}))

vi.mock('../../../components/EpisodeRow/EpisodeRow', () => ({
  EpisodeRow: ({
    episode,
    isLast,
    onPlay,
  }: {
    episode: FeedEpisode
    isLast?: boolean
    onPlay?: () => void
  }) => (
    <button
      type="button"
      data-testid={`episode-row-${episode.episodeGuid}`}
      data-is-last={isLast ? 'true' : 'false'}
      onClick={onPlay}
    >
      {episode.title}
    </button>
  ),
}))

vi.mock('react-virtuoso', () => ({
  GroupedVirtuoso: ({
    data = [],
    groupCounts = [],
    groupContent,
    itemContent,
    computeItemKey,
    components,
  }: {
    data?: FeedEpisode[]
    groupCounts?: number[]
    groupContent?: (groupIndex: number) => React.ReactNode
    itemContent?: (index: number, groupIndex: number, item: FeedEpisode) => React.ReactNode
    computeItemKey?: (index: number, item: FeedEpisode) => React.Key
    components?: {
      Header?: React.ComponentType
      Footer?: React.ComponentType
    }
  }) => {
    let flatIndex = 0
    let groupStartIndex = 0
    const groups: React.ReactNode[] = []

    for (const count of groupCounts) {
      const groupIndex = groups.length
      const firstEpisode = data[groupStartIndex]
      const groupKey = firstEpisode?.episodeGuid ?? `group-${groupStartIndex}-${count}`

      const items = Array.from({ length: count }).map((_, indexInGroup) => {
        const episode = data[flatIndex]
        const key = computeItemKey?.(flatIndex, episode) ?? flatIndex
        const content = itemContent?.(flatIndex, groupIndex, episode)
        flatIndex += 1

        return (
          <div key={String(key)} data-testid={`group-item-${groupIndex}-${indexInGroup}`}>
            {content}
          </div>
        )
      })

      groups.push(
        <div key={groupKey}>
          <div data-testid={`group-header-${groupIndex}`}>{groupContent?.(groupIndex)}</div>
          {items}
        </div>
      )
      groupStartIndex += count
    }

    const Header = components?.Header
    const Footer = components?.Footer

    return (
      <div data-testid="grouped-virtuoso">
        {Header && <Header />}
        {groups}
        {Footer && <Footer />}
      </div>
    )
  },
}))

describe('PodcastEpisodesPage virtualized grouped rendering', () => {
  beforeEach(() => {
    intersectionObserverCtor.mockClear()
    mockPodcast = makePodcast({
      podcastItunesId: '123',
      title: 'Test Podcast',
      author: 'Author',
      artwork: 'https://example.com/art.jpg',
      description: 'Description',
      feedUrl: 'https://example.com/feed.xml',
      lastUpdateTime: 1700000000000,
      episodeCount: 60,
    })
    mockEpisodes = [
      makeFeedEpisode({
        episodeGuid: 'ep-1',
        title: 'Episode ep-1',
        description: 'Description ep-1',
        audioUrl: 'https://example.com/audio/ep-1.mp3',
        pubDate: '2025-01-01T00:00:00.000Z',
      }),
      makeFeedEpisode({
        episodeGuid: 'ep-2',
        title: 'Episode ep-2',
        description: 'Description ep-2',
        audioUrl: 'https://example.com/audio/ep-2.mp3',
        pubDate: '2025-01-01T00:00:00.000Z',
      }),
      makeFeedEpisode({
        episodeGuid: 'ep-3',
        title: 'Episode ep-3',
        description: 'Description ep-3',
        audioUrl: 'https://example.com/audio/ep-3.mp3',
        pubDate: '2024-01-01T00:00:00.000Z',
      }),
    ]

    originalIntersectionObserver = globalThis.IntersectionObserver
    // The virtualized path must not rely on IntersectionObserver-driven incremental rendering.
    // @ts-expect-error test shim
    globalThis.IntersectionObserver = vi.fn(() => {
      intersectionObserverCtor()
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
        takeRecords: vi.fn(),
      }
    })
  })

  afterEach(() => {
    ;(
      globalThis as { IntersectionObserver?: typeof globalThis.IntersectionObserver }
    ).IntersectionObserver = originalIntersectionObserver
  })

  it('renders grouped year headers, keeps row wiring, and preserves isLast at group boundaries', () => {
    render(<PodcastEpisodesPage />)

    expect(screen.queryByTestId('grouped-virtuoso')).not.toBeNull()
    expect(screen.queryByText('2025')).not.toBeNull()
    expect(screen.queryByText('2024')).not.toBeNull()

    expect(screen.getByTestId('episode-row-ep-1').getAttribute('data-is-last')).toBe('false')
    expect(screen.getByTestId('episode-row-ep-2').getAttribute('data-is-last')).toBe('true')
    expect(screen.getByTestId('episode-row-ep-3').getAttribute('data-is-last')).toBe('true')

    expect(globalThis.IntersectionObserver).not.toHaveBeenCalled()
    expect(intersectionObserverCtor).not.toHaveBeenCalled()
  })

  it('groups malformed pubDate entries into unknown-year bucket without breaking rendering', () => {
    mockEpisodes = [
      makeFeedEpisode({
        episodeGuid: 'ep-valid',
        title: 'Episode ep-valid',
        description: 'Description ep-valid',
        audioUrl: 'https://example.com/audio/ep-valid.mp3',
        pubDate: '2025-01-01T00:00:00.000Z',
      }),
      makeFeedEpisode({
        episodeGuid: 'ep-invalid',
        title: 'Episode invalid',
        description: 'Description invalid',
        audioUrl: 'https://example.com/audio/invalid.mp3',
        pubDate: 'not-a-date',
      }),
    ]

    render(<PodcastEpisodesPage />)

    expect(screen.queryByText('2025')).not.toBeNull()
    expect(screen.queryByText('unknownTitle')).not.toBeNull()
    expect(screen.queryByTestId('episode-row-ep-invalid')).not.toBeNull()
  })

  it('renders an explicit empty state for same-country zero-episode feeds', () => {
    mockEpisodes = []

    render(<PodcastEpisodesPage />)

    expect(screen.queryByText('noEpisodes')).not.toBeNull()
    expect(screen.queryByTestId('grouped-virtuoso')).toBeNull()
  })
})
