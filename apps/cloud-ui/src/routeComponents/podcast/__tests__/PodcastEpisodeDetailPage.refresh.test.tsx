import { render } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../__tests__/queryClient'
import { makeEpisode, makeMinimalPodcast } from '../../../lib/discovery/__tests__/fixtures'
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
    routeStateValue: unknown
  ) => useEpisodeResolutionMock(podcastId, episodeKey, country, routeStateValue),
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
      pause: vi.fn(),
      setPlaybackTrackId: vi.fn(),
    }),
}))

vi.mock('@/store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setPlayableContext: vi.fn(),
      toDocked: vi.fn(),
      toMini: vi.fn(),
    }),
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

describe('PodcastEpisodeDetailPage canonical refresh', () => {
  it('resolves from path params without requiring query hints', () => {
    useEpisodeResolutionMock.mockReturnValue({
      resolvedContent: null,
      isLoading: false,
      resolutionError: new Error('not-found'),
      notFound: 'podcast',
    })
    navigateMock.mockReset()
    routePodcastId = '123'
    routeEpisodeKey = 'h_M4G0OdR4aJaAfgXlSAdA'
    routeState = null

    render(<PodcastEpisodeDetailPage />, { wrapper: createQueryClientWrapper() })

    expect(useEpisodeResolutionMock).toHaveBeenCalledWith(
      '123',
      'h_M4G0OdR4aJaAfgXlSAdA',
      'us',
      null
    )
  })

  it('no longer handles canonical redirects in component (handled by loader)', () => {
    const podcast = {
      ...makeMinimalPodcast({
        podcastItunesId: '1065559535',
        title: 'Modern Love',
        author: 'The New York Times',
        artwork: 'https://example.com/show-600.jpg',
      }),
    }
    const episode = makeEpisode({
      guid: 'a8343698-1dca-4c63-bb5d-3e2a61522c2a',
      title: 'Lindy West Thought She Couldn’t Handle Polyamory. She Was Wrong.',
      audioUrl: 'https://example.com/audio.mp3',
      pubDate: '2025-01-01T00:00:00.000Z',
      duration: 1200,
      description: 'desc',
    })

    useEpisodeResolutionMock.mockReturnValue({
      resolvedContent: { podcast, episode },
      isLoading: false,
      resolutionError: null,
      notFound: null,
    })
    navigateMock.mockReset()
    routePodcastId = '1065559535'
    routeEpisodeKey = 'wrong_key'
    routeState = null

    render(<PodcastEpisodeDetailPage />, { wrapper: createQueryClientWrapper() })

    expect(navigateMock).not.toHaveBeenCalled()
  })
})
