import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEpisode, makePodcast, makePodcastEpisodes } from '@/lib/discovery/__tests__/fixtures'
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
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: vi.fn((selector) =>
    selector({
      country: 'us',
    })
  ),
}))

vi.mock('../../../components/EpisodeRow/EpisodeRow', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  EpisodeRow: ({ episode, isLast }: any) => (
    <div data-testid={`episode-row-${episode.guid}`} data-is-last={isLast ? 'true' : 'false'}>
      {episode.title}
    </div>
  ),
}))

vi.mock('react-virtuoso', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  Virtuoso: ({ data, itemContent }: any) => (
    <div data-testid="mock-virtuoso">
      {/* biome-ignore lint/suspicious/noExplicitAny: test mock */}
      {data.map((item: any, index: number) => (
        <div key={item.key} data-testid={`virtuoso-item-${index}`}>
          {itemContent(index, item)}
        </div>
      ))}
    </div>
  ),
}))

function mockPodcastAndArchive(episodes: ReturnType<typeof makePodcastEpisodes>['episodes']) {
  ;(useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    ({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (queryKey[1] === 'detail') {
        return {
          data: makePodcast({
            podcastItunesId: '123',
            title: 'Test Podcast',
            author: 'Host',
            lastUpdateTime: 1,
            episodeCount: episodes.length,
          }),
          isLoading: false,
          error: null,
        }
      }

      if (queryKey[1] === 'episodes') {
        return {
          data: makePodcastEpisodes({
            episodes,
          }),
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
          episodes,
          hasMore: false,
          nextOffset: episodes.length,
          storedTotal: episodes.length,
        }),
      ],
    },
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  })
}

describe('PodcastEpisodesPage virtualized rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders flat PI episode list rows with year headers and correctly assigns isLast', async () => {
    mockPodcastAndArchive([
      makeEpisode({ guid: 'ep1', title: 'Episode 1', pubDate: 1735689600 }),
      makeEpisode({ guid: 'ep2', title: 'Episode 2', pubDate: 1735689600 }),
      makeEpisode({ guid: 'ep3', title: 'Episode 3', pubDate: 1704067200 }),
    ])

    render(<PodcastEpisodesPage />)

    expect(await screen.findByTestId('mock-virtuoso')).toBeDefined()
    expect(screen.getByText('2025')).toBeDefined()
    expect(screen.getByText('2024')).toBeDefined()

    expect(screen.getByTestId('episode-row-ep1').getAttribute('data-is-last')).toBe('false')
    expect(screen.getByTestId('episode-row-ep2').getAttribute('data-is-last')).toBe('true')
    expect(screen.getByTestId('episode-row-ep3').getAttribute('data-is-last')).toBe('true')
  })

  it('preserves the canonical PI episode list ordering without resorting', async () => {
    mockPodcastAndArchive([
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
    ])

    render(<PodcastEpisodesPage />)
    const virtuoso = await screen.findByTestId('mock-virtuoso')
    const childrenText = Array.from(virtuoso.children).map((node) => node.textContent)

    expect(childrenText[0]).toContain('2026')
    expect(childrenText[1]).toContain('Ep 1 (2026)')
    expect(childrenText[2]).toContain('2019')
    expect(childrenText[3]).toContain('Ep 2 (2019)')
    expect(childrenText[4]).toContain('2025')
    expect(childrenText[5]).toContain('Ep 3 (2025)')
    expect(childrenText[6]).toContain('Ep 4 (2025)')

    expect(screen.getByTestId('episode-row-ep1').getAttribute('data-is-last')).toBe('true')
    expect(screen.getByTestId('episode-row-ep2').getAttribute('data-is-last')).toBe('true')
    expect(screen.getByTestId('episode-row-ep3').getAttribute('data-is-last')).toBe('false')
    expect(screen.getByTestId('episode-row-ep4').getAttribute('data-is-last')).toBe('true')
  })

  it('groups malformed PI pubDate entries into the unknown-year bucket', async () => {
    mockPodcastAndArchive([
      makeEpisode({
        guid: 'ep-valid',
        title: 'Episode valid',
        pubDate: 1735689600,
      }),
      makeEpisode({
        guid: 'ep-invalid',
        title: 'Episode invalid',
        pubDate: 0,
      }),
    ])

    render(<PodcastEpisodesPage />)

    expect(await screen.findByTestId('mock-virtuoso')).toBeDefined()
    expect(screen.getByText('2025')).toBeDefined()
    expect(screen.getByText('unknownTitle')).toBeDefined()
  })
})
