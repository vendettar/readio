import { render, screen } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeEpisode,
  makePodcast,
  makePodcastEpisodes,
} from '../../../lib/discovery/__tests__/fixtures'
import PodcastEpisodeDetailPage from '../PodcastEpisodeDetailPage'
import PodcastEpisodesPage from '../PodcastEpisodesPage'
import PodcastShowPage from '../PodcastShowPage'

const useQueryMock = vi.fn()
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
  lastUpdateTime: 1,
  episodeCount: 10,
})

function setQueryState(input: {
  podcast?: typeof mockPodcast | null
  podcastError?: Error | null
  episodeList?: ReturnType<typeof makePodcastEpisodes> | undefined
  episodesError?: Error | null
}) {
  useQueryMock.mockImplementation(({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[1] === 'podcast-detail') {
      return {
        data: input.podcast ?? null,
        isLoading: false,
        error: input.podcastError ?? null,
      }
    }

    if (queryKey[1] === 'episodes') {
      return {
        data: input.episodeList,
        isLoading: false,
        error: input.episodesError ?? null,
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

  it('show page renders fetch error state when podcast metadata lookup fails', () => {
    setQueryState({
      podcast: null,
      podcastError: new Error('lookup failed'),
    })

    render(<PodcastShowPage />)

    expect(screen.queryByText('errorPodcastUnavailable')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('show page keeps the shell and degrades only the episodes section when PI episode list lookup fails', () => {
    setQueryState({
      podcast: mockPodcast,
      episodeList: undefined,
      episodesError: new Error('episode list failed'),
    })

    render(<PodcastShowPage />)

    expect(screen.queryByText('Test Podcast')).not.toBeNull()
    expect(screen.queryByText('errorPodcastUnavailable')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('show page renders noEpisodes for a successful empty PI episode list', () => {
    setQueryState({
      podcast: mockPodcast,
      episodeList: makePodcastEpisodes({ episodes: [] }),
      episodesError: null,
    })

    render(<PodcastShowPage />)

    expect(screen.queryByText('noEpisodes')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('episodes page renders fetch error state when the PI episode list fails', () => {
    setQueryState({
      podcast: mockPodcast,
      episodeList: undefined,
      episodesError: new Error('episode list failed'),
    })

    render(<PodcastEpisodesPage />)

    expect(screen.queryByText('errorPodcastUnavailable')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('episodes page renders noEpisodes for a successful empty PI episode list', () => {
    setQueryState({
      podcast: mockPodcast,
      episodeList: makePodcastEpisodes({ episodes: [] }),
      episodesError: null,
    })

    render(<PodcastEpisodesPage />)

    expect(screen.queryByText('noEpisodes')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('detail page renders fetch error state when resolution fails', () => {
    useEpisodeResolutionMock.mockReturnValue({
      resolvedContent: null,
      isLoading: false,
      resolutionError: new Error('lookup failed'),
      notFound: null,
    })

    render(<PodcastEpisodeDetailPage />)

    expect(screen.queryByText('errorPodcastUnavailable')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('detail page renders episodeNotFound when the target guid is absent from a successful PI episode list', () => {
    useEpisodeResolutionMock.mockReturnValue({
      resolvedContent: null,
      isLoading: false,
      resolutionError: null,
      notFound: 'episode',
    })

    render(<PodcastEpisodeDetailPage />)

    expect(screen.queryByText('episodeNotFound')).not.toBeNull()
    expect(screen.queryByText('regionUnavailableMessage')).toBeNull()
  })

  it('detail page renders the episode when resolution succeeds', () => {
    useEpisodeResolutionMock.mockReturnValue({
      resolvedContent: {
        podcast: mockPodcast,
        episode: makeEpisode({ guid: 'ep-1', title: 'Resolved Episode' }),
      },
      isLoading: false,
      resolutionError: null,
      notFound: null,
    })

    render(<PodcastEpisodeDetailPage />)

    expect(screen.queryByText('Resolved Episode')).not.toBeNull()
  })
})
