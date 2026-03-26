import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PodcastEpisodeDetailPage from '../PodcastEpisodeDetailPage'

const useEpisodeResolutionMock = vi.fn(
  (_podcastId: string, _episodeId: string, _country: string) => ({
    podcast: null,
    episode: undefined,
    isLoading: false,
    podcastError: new Error('not-found'),
    resolutionError: new Error('not-found'),
  })
)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ country: 'us', id: '123', episodeId: 'episode-abc12345' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/hooks/useEpisodeResolution', () => ({
  useEpisodeResolution: (podcastId: string, episodeId: string, country: string) =>
    useEpisodeResolutionMock(podcastId, episodeId, country),
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
    render(<PodcastEpisodeDetailPage />)

    expect(useEpisodeResolutionMock).toHaveBeenCalledWith('123', 'episode-abc12345', 'us')
  })
})
