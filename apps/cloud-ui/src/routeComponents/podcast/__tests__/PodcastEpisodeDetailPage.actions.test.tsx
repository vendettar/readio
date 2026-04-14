import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastEpisodeDetailPage from '../PodcastEpisodeDetailPage'

const addFavoriteMock = vi.fn()
const removeFavoriteMock = vi.fn()
const playEpisodeMock = vi.fn()

let favorited = false

const podcast = {
  podcastItunesId: 'pod-1',
  title: 'Podcast Show',
  author: 'Host',
  feedUrl: 'https://example.com/feed.xml',
  artwork: 'https://example.com/art-600.jpg',
  image: 'https://example.com/art-100.jpg',
}

const episode = {
  id: 'ep-1',
  title: 'Episode One',
  audioUrl: 'https://example.com/ep-1.mp3',
  pubDate: '2024-01-01T00:00:00.000Z',
  duration: 1200,
  description: 'Episode description',
  descriptionHtml: '<p>Episode description</p>',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ country: 'us', id: 'pod-1', episodeKey: 'ep-key' }),
  useLocation: () => ({ state: null }),
}))

vi.mock('../../../hooks/useEpisodeResolution', () => ({
  useEpisodeResolution: () => ({
    podcast,
    episode,
    isLoading: false,
    podcastError: null,
    resolutionError: null,
  }),
}))

vi.mock('../../../components/interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: () => <div>artwork</div>,
}))

vi.mock('../../../components/interactive/InteractiveTitle', () => ({
  InteractiveTitle: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: (...args: unknown[]) => playEpisodeMock(...args),
  }),
}))

vi.mock('../../../lib/openExternal', () => ({
  openExternal: vi.fn(),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
      addFavorite: addFavoriteMock,
      removeFavorite: removeFavoriteMock,
      isFavorited: () => favorited,
    }),
}))

describe('PodcastEpisodeDetailPage action wiring', () => {
  beforeEach(() => {
    favorited = false
    addFavoriteMock.mockReset()
    removeFavoriteMock.mockReset()
    playEpisodeMock.mockReset()
    navigateMock.mockReset()
  })

  it('adds favorite when not favorited', () => {
    render(<PodcastEpisodeDetailPage />)

    const favoriteButton = screen.getByLabelText('ariaAddFavorite')
    fireEvent.click(favoriteButton)

    expect(addFavoriteMock).toHaveBeenCalledTimes(1)
    expect(removeFavoriteMock).not.toHaveBeenCalled()
  })

  it('removes favorite when already favorited', () => {
    favorited = true
    render(<PodcastEpisodeDetailPage />)

    const favoriteButton = screen.getByLabelText('ariaRemoveFavorite')
    fireEvent.click(favoriteButton)

    expect(removeFavoriteMock).toHaveBeenCalledTimes(1)
    expect(addFavoriteMock).not.toHaveBeenCalled()
  })

  it('plays episode through shared playback hook', () => {
    render(<PodcastEpisodeDetailPage />)

    fireEvent.click(screen.getByRole('button', { name: 'btnPlayOnly' }))

    expect(playEpisodeMock).toHaveBeenCalledTimes(1)
    expect(playEpisodeMock).toHaveBeenCalledWith(episode, podcast, 'us')
  })
})
