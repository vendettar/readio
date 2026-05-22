import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeEpisode,
  makePodcast,
  makePodcastEpisodes,
} from '../../../lib/discovery/__tests__/fixtures'
import PodcastShowPage from '../PodcastShowPage'

const subscribeMock = vi.fn()
const unsubscribeMock = vi.fn()
const playEpisodeMock = vi.fn()
let routeCountry = 'us'
let detailIsFetching = false
let episodePagesAreFetching = false

const podcast = makePodcast({
  podcastItunesId: 'pod-1',
  title: 'Podcast Show',
  genres: ['News'],
})

const episodeList = makePodcastEpisodes({
  episodes: [
    makeEpisode({
      guid: 'ep-1',
      title: 'Episode 1',
      audioUrl: 'https://example.com/ep-1.mp3',
      pubDate: 1704067200,
      description: 'Episode 1 description',
    }),
  ],
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useParams: () => ({ country: routeCountry, id: 'pod-1' }),
  useLocation: () => ({ state: null }),
}))

const useQueryMock = vi.fn()
const useInfiniteQueryMock = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => useQueryMock(options),
  useInfiniteQuery: (options: { queryKey: readonly unknown[] }) => useInfiniteQueryMock(options),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
    getQueryState: vi.fn(),
  }),
}))

function mockPodcastShowQueries() {
  useQueryMock.mockImplementation(({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[1] === 'detail') {
      return { data: podcast, isLoading: false, isFetching: detailIsFetching, error: null }
    }
    return { data: undefined, isLoading: false, isFetching: false, error: null }
  })
  useInfiniteQueryMock.mockReturnValue({
    data: { pages: [episodeList], pageParams: [0] },
    isLoading: false,
    isFetching: episodePagesAreFetching,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  })
}

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: playEpisodeMock,
  }),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      subscriptions: [],
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      country: 'us',
      isFavorited: () => false,
    }),
}))

vi.mock('../../../lib/discovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/discovery')>()
  return {
    ...actual,
    default: {
      getPodcastIndexPodcastByItunesId: vi.fn(),
      fetchPodcastEpisodes: vi.fn(),
    },
  }
})

describe('PodcastShowPage action wiring', () => {
  beforeEach(() => {
    useQueryMock.mockReset()
    useInfiniteQueryMock.mockReset()
    mockPodcastShowQueries()
    routeCountry = 'us'
    detailIsFetching = false
    episodePagesAreFetching = false
    subscribeMock.mockReset()
    unsubscribeMock.mockReset()
    playEpisodeMock.mockReset()
  })

  it('keeps subscribe action semantics after extraction', async () => {
    subscribeMock.mockResolvedValue(undefined)
    render(<PodcastShowPage />)

    const subscribeBtn = screen.getByLabelText('subscribe')
    fireEvent.click(subscribeBtn)

    expect(subscribeMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeMock).not.toHaveBeenCalled()
  })

  it('does not render latest-episode play action when route country is invalid', async () => {
    routeCountry = 'invalid'
    render(<PodcastShowPage />)

    expect(screen.queryByText('latestEpisode')).toBeNull()
    expect(playEpisodeMock).not.toHaveBeenCalled()
  })

  it('keeps episode preview in loading state while detail refresh is checking for updates', async () => {
    detailIsFetching = true
    render(<PodcastShowPage />)

    expect(screen.queryByText('latestEpisode')).toBeNull()
    expect(screen.queryByText('Episode 1')).toBeNull()
  })
})
