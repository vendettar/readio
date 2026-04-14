import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Episode, Podcast } from '../../../lib/discovery/providers/types'
import PodcastEpisodesPage from '../PodcastEpisodesPage'

const playEpisodeMock = vi.fn()
const intersectionObserverCtor = vi.fn()

let mockPodcast: Podcast | null = null
let mockEpisodes: Episode[] = []
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
    if (queryKey[1] === 'podcast-index-lookup') {
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
    playEpisode: playEpisodeMock,
  }),
}))

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: vi.fn(),
    fetchPodcastFeed: vi.fn(),
    getPodcastIndexEpisodes: vi.fn(),
  },
}))

vi.mock('../../../components/EpisodeRow/EpisodeRow', () => ({
  EpisodeRow: ({
    episode,
    isLast,
    onPlay,
  }: {
    episode: Episode
    isLast?: boolean
    onPlay?: () => void
  }) => (
    <button
      type="button"
      data-testid={`episode-row-${episode.id}`}
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
    data?: Episode[]
    groupCounts?: number[]
    groupContent?: (groupIndex: number) => React.ReactNode
    itemContent?: (index: number, groupIndex: number, item: Episode) => React.ReactNode
    computeItemKey?: (index: number, item: Episode) => React.Key
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
      const groupKey =
        firstEpisode?.id ?? firstEpisode?.providerEpisodeId ?? `group-${groupStartIndex}-${count}`

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

function makeEpisode(id: string, year: number): Episode {
  return {
    id,
    title: `Episode ${id}`,
    description: `Description ${id}`,
    audioUrl: `https://example.com/audio/${id}.mp3`,
    pubDate: `${year}-01-01T00:00:00.000Z`,
  }
}

describe('PodcastEpisodesPage virtualized grouped rendering', () => {
  beforeEach(() => {
    playEpisodeMock.mockReset()
    intersectionObserverCtor.mockClear()
    mockPodcast = {
      podcastItunesId: '123',
      title: 'Test Podcast',
      feedUrl: 'https://example.com/feed.xml',
      episodeCount: 60,
    }
    mockEpisodes = [makeEpisode('ep-1', 2025), makeEpisode('ep-2', 2025), makeEpisode('ep-3', 2024)]

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

    fireEvent.click(screen.getByTestId('episode-row-ep-1'))
    expect(playEpisodeMock).toHaveBeenCalledTimes(1)
    expect(playEpisodeMock).toHaveBeenCalledWith(mockEpisodes[0], mockPodcast, 'us')

    expect(globalThis.IntersectionObserver).not.toHaveBeenCalled()
    expect(intersectionObserverCtor).not.toHaveBeenCalled()
  })

  it('keeps limited-feed notice behavior after virtualization', () => {
    const firstRender = render(<PodcastEpisodesPage />)
    expect(screen.queryByText('feedLimitedAccess')).not.toBeNull()
    firstRender.unmount()

    mockPodcast = {
      id: '123',
      title: 'Test Podcast',
      author: 'Test Author',
      image: 'https://example.com/image.jpg',
      artwork: 'https://example.com/image.jpg',
      genres: [{ name: 'News', genreId: '1' }],
      url: 'https://example.com/podcast',
      episodeCount: 3,
    } as unknown as Podcast

    render(<PodcastEpisodesPage />)
    expect(screen.queryByText('feedLimitedAccess')).toBeNull()
  })

  it('groups malformed pubDate entries into unknown-year bucket without breaking rendering', () => {
    mockEpisodes = [
      makeEpisode('ep-valid', 2025),
      {
        id: 'ep-invalid',
        title: 'Episode invalid',
        description: 'Description invalid',
        audioUrl: 'https://example.com/audio/invalid.mp3',
        pubDate: 'not-a-date',
      },
    ]

    render(<PodcastEpisodesPage />)

    expect(screen.queryByText('2025')).not.toBeNull()
    expect(screen.queryByText('unknownTitle')).not.toBeNull()
    expect(screen.queryByTestId('episode-row-ep-invalid')).not.toBeNull()
  })
})
