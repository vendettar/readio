import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastEpisodeDetailPage from '../PodcastEpisodeDetailPage'
import PodcastEpisodesPage from '../PodcastEpisodesPage'
import PodcastShowPage from '../PodcastShowPage'

const useQueryMock = vi.fn()
const useEpisodeResolutionMock = vi.fn()
const queryClientMock = {
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
}

const mockPodcast = {
  podcastItunesId: '123',
  collectionName: 'Test Podcast',
  artistName: 'Author',
  feedUrl: 'https://example.com/feed.xml',
  artworkUrl600: 'https://example.com/art-600.jpg',
  artworkUrl100: 'https://example.com/art-100.jpg',
}

function setQueryState(input: {
  podcast?: typeof mockPodcast | null
  podcastError?: Error | null
  feed?: { episodes: Array<Record<string, unknown>> } | undefined
  feedError?: Error | null
}) {
  useQueryMock.mockImplementation(({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[1] === 'lookup' || queryKey[1] === 'podcast-index-lookup') {
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
  useQueryClient: () => queryClientMock,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useLocation: () => ({ state: null }),
  useNavigate: () => vi.fn(),
  useParams: () => ({ country: 'us', id: '123', episodeId: 'episode-abc12345' }),
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useEpisodeResolution', () => ({
  useEpisodeResolution: (
    podcastId: string,
    episodeId: string,
    country: string,
    routeState?: unknown
  ) => useEpisodeResolutionMock(podcastId, episodeId, country, routeState),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: vi.fn(),
    fetchPodcastFeed: vi.fn(),
    getPodcastIndexEpisodes: vi.fn(),
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
      feed: { episodes: [] },
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
      feed: { episodes: [] },
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
