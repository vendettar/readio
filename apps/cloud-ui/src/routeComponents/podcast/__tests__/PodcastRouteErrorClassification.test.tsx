import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeParsedFeed, makePodcast } from '../../../lib/discovery/__tests__/fixtures'
import PodcastEpisodeDetailPage from '../PodcastEpisodeDetailPage'
import PodcastEpisodesPage from '../PodcastEpisodesPage'
import PodcastShowPage from '../PodcastShowPage'

const useQueryMock = vi.fn()
const useInfiniteQueryMock = vi.fn()
const useEpisodeResolutionMock = vi.fn()
const queryClientMock = {
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  getQueryState: vi.fn(() => ({ dataUpdatedAt: 0 })),
}

const mockPodcast = makePodcast({
  podcastItunesId: '123',
  title: 'Test Podcast',
  author: 'Author',
})

function setQueryState(input: {
  podcast?: typeof mockPodcast | null
  podcastError?: Error | null
  feed?: ReturnType<typeof makeParsedFeed> | undefined
  feedError?: Error | null
}) {
  useQueryMock.mockImplementation(({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[1] === 'podcast-detail') {
      return {
        data: input.podcast ?? null,
        isLoading: false,
        error: input.podcastError ?? null,
      }
    }

    if (queryKey[1] === 'feed') {
      return {
        data: input.feed,
        isLoading: false,
        error: input.feedError ?? null,
      }
    }

    return {
      data: undefined,
      isLoading: false,
      error: null,
    }
  })

  useInfiniteQueryMock.mockImplementation(({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[1] === 'feed') {
      return {
        data: input.feed ? { pages: [input.feed] } : undefined,
        isLoading: false,
        error: input.feedError ?? null,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
      }
    }

    return {
      data: undefined,
      isLoading: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    }
  })
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (args: unknown) => useQueryMock(args),
  useInfiniteQuery: (args: unknown) => useInfiniteQueryMock(args),
  useQueryClient: () => queryClientMock,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useLocation: () => ({ state: null }),
  useNavigate: () => vi.fn(),
  useParams: () => ({ country: 'us', id: '123', episodeKey: 'qDQ2mB3KTGO7XT4qYVIsKg' }),
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useEpisodeResolution', () => ({
  useEpisodeResolution: (
    podcastId: string,
    episodeKey: string,
    country: string,
    routeState?: unknown
  ) => useEpisodeResolutionMock(podcastId, episodeKey, country, routeState),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: vi.fn(),
    fetchPodcastFeed: vi.fn(),
  },
}))

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'cn',
      subscriptions: [],
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      isFavorited: () => false,
    }),
}))

vi.mock('../../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setAudioUrl: vi.fn(),
      play: vi.fn(),
    }),
}))

describe('Podcast route error classification', () => {
  beforeEach(() => {
    useQueryMock.mockReset()
    useInfiniteQueryMock.mockReset()
    useEpisodeResolutionMock.mockReset()
    queryClientMock.getQueryData.mockReset()
    queryClientMock.getQueryData.mockReturnValue(undefined)
    queryClientMock.setQueryData.mockReset()
  })

  it('show page renders fetch error state when upstream feed/provider fails', () => {
    setQueryState({
      podcast: mockPodcast,
      feed: undefined,
      feedError: new Error('feed failed'),
    })

    render(<PodcastShowPage />)

    expect(screen.queryByText('errorPodcastUnavailable')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('show page renders region-unavailable only for successful upstream unresolved content', () => {
    setQueryState({
      podcast: mockPodcast,
      feed: makeParsedFeed({ episodes: [] }),
      feedError: null,
    })

    render(<PodcastShowPage />)

    expect(screen.queryByText('regionUnavailableMessage')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableCta')).not.toBeNull()
  })

  it('episodes page renders fetch error state when upstream feed/provider fails', () => {
    setQueryState({
      podcast: mockPodcast,
      feed: undefined,
      feedError: new Error('feed failed'),
    })

    render(<PodcastEpisodesPage />)

    expect(screen.queryByText('errorPodcastUnavailable')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('episodes page renders region-unavailable only for successful upstream unresolved content', () => {
    setQueryState({
      podcast: mockPodcast,
      feed: makeParsedFeed({ episodes: [] }),
      feedError: null,
    })

    render(<PodcastEpisodesPage />)

    expect(screen.queryByText('regionUnavailableMessage')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableCta')).not.toBeNull()
  })

  it('detail page renders fetch error state when resolution fails', () => {
    useEpisodeResolutionMock.mockReturnValue({
      podcast: mockPodcast,
      episode: undefined,
      isLoading: false,
      podcastError: null,
      resolutionError: new Error('lookup failed'),
    })

    render(<PodcastEpisodeDetailPage />)

    expect(screen.queryByText('errorPodcastUnavailable')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('detail page renders region-unavailable only for successful upstream unresolved content', () => {
    useEpisodeResolutionMock.mockReturnValue({
      podcast: mockPodcast,
      episode: undefined,
      isLoading: false,
      podcastError: null,
      resolutionError: null,
    })

    render(<PodcastEpisodeDetailPage />)

    expect(screen.queryByText('regionUnavailableMessage')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableCta')).not.toBeNull()
  })
})
