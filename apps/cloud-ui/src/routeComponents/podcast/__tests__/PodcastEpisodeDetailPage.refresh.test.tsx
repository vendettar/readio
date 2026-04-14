import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PodcastEpisodeDetailPage from '../PodcastEpisodeDetailPage'

const useEpisodeResolutionMock = vi.fn()
const navigateMock = vi.fn()
let routePodcastId = '123'
let routeEpisodeKey = 'h_M4G0OdR4aJaAfgXlSAdA'
let routeState: unknown = null

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useParams: () => ({ country: 'us', id: routePodcastId, episodeKey: routeEpisodeKey }),
  useNavigate: () => navigateMock,
  useLocation: () => ({ state: routeState }),
}))

vi.mock('@/hooks/useEpisodeResolution', () => ({
  useEpisodeResolution: (
    podcastId: string,
    episodeKey: string,
    country: string,
    routeState: unknown
  ) => useEpisodeResolutionMock(podcastId, episodeKey, country, routeState),
}))

vi.mock('@/store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      isFavorited: () => false,
    }),
}))

vi.mock('@/store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setAudioUrl: vi.fn(),
      play: vi.fn(),
    }),
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

describe('PodcastEpisodeDetailPage canonical refresh', () => {
  it('resolves from path params without requiring query hints', () => {
    useEpisodeResolutionMock.mockReturnValue({
      podcast: null,
      episode: undefined,
      isLoading: false,
      podcastError: new Error('not-found'),
      resolutionError: new Error('not-found'),
    })
    navigateMock.mockReset()
    routePodcastId = '123'
    routeEpisodeKey = 'h_M4G0OdR4aJaAfgXlSAdA'
    routeState = null

    render(<PodcastEpisodeDetailPage />)

    expect(useEpisodeResolutionMock).toHaveBeenCalledWith(
      '123',
      'h_M4G0OdR4aJaAfgXlSAdA',
      'us',
      null
    )
  })

  it('redirects editor-pick detail pages onto podcastItunesId plus stable episode identity canonical routes', () => {
    useEpisodeResolutionMock.mockReturnValue({
      podcast: {
        collectionName: 'Modern Love',
        artistName: 'The New York Times',
        artworkUrl100: 'https://example.com/show-100.jpg',
        artworkUrl600: 'https://example.com/show-600.jpg',
        feedUrl: 'https://feeds.simplecast.com/eHEJ08b1',
        collectionViewUrl: '',
        genres: [],
        id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
        feedId: '436568',
        podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
        editorPickSnapshot: {
          id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
          name: 'Modern Love',
          artistName: 'The New York Times',
          artworkUrl100: 'https://example.com/show-100.jpg',
          url: 'https://example.com/show',
          genres: [],
          feedUrl: 'https://feeds.simplecast.com/eHEJ08b1',
          feedId: '436568',
          podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
          podcastItunesId: '1065559535',
        },
      },
      episode: {
        id: 'a8343698-1dca-4c63-bb5d-3e2a61522c2a',
        title: 'Lindy West Thought She Couldn’t Handle Polyamory. She Was Wrong.',
        audioUrl: 'https://example.com/audio.mp3',
        pubDate: '2025-01-01T00:00:00.000Z',
        duration: 1200,
        description: 'desc',
      },
      isLoading: false,
      podcastError: null,
      resolutionError: null,
    })
    navigateMock.mockReset()
    routePodcastId = '1065559535'
    routeEpisodeKey = 'wrong_key'
    routeState = null

    render(<PodcastEpisodeDetailPage />)

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/podcast/$country/$id/$episodeKey',
        params: {
          country: 'us',
          id: '1065559535',
          episodeKey: 'qDQ2mB3KTEO7XT4qYVIsKg', // Compact key for a8343698-1dca-4c63-bb5d-3e2a61522c2a
        },
        replace: true,
      })
    )
  })
})
