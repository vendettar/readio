import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpandableDescriptionProps } from '../../../components/ui/expandable-description'
import type { FeedEpisode } from '../../../lib/discovery'
import { makeFeedEpisode, makePodcast } from '../../../lib/discovery/__tests__/fixtures'
import { normalizeFeedUrl } from '../../../lib/discovery/feedUrl'
import PodcastEpisodeDetailPage from '../PodcastEpisodeDetailPage'

const addFavoriteMock = vi.fn()
const removeFavoriteMock = vi.fn()
const playEpisodeMock = vi.fn()
const episodeDetailDownloadButtonPropsSpy = vi.fn()
const expandableDescriptionPropsSpy = vi.fn()

let favorited = false
let resolvedEpisode: FeedEpisode = makeFeedEpisode({
  episodeGuid: 'ep-1',
  title: 'Episode One',
  audioUrl: 'https://example.com/ep-1.mp3',
  pubDate: '2024-01-01T00:00:00.000Z',
  duration: 1200,
  description: 'Episode description',
  descriptionHtml: '<p>Episode description</p>',
})

const podcast = makePodcast({
  podcastItunesId: 'pod-1',
  title: 'Podcast Show',
  feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
})

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
    episode: resolvedEpisode,
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

vi.mock('../../../components/ui/expandable-description', () => ({
  ExpandableDescription: (props: ExpandableDescriptionProps) => {
    expandableDescriptionPropsSpy(props)
    return <div>expandable-description</div>
  },
}))

vi.mock('../EpisodeDetailDownloadButton', () => ({
  EpisodeDetailDownloadButton: (props: Record<string, unknown>) => {
    episodeDetailDownloadButtonPropsSpy(props)
    return <div>download-button</div>
  },
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
    resolvedEpisode = makeFeedEpisode({
      episodeGuid: 'ep-1',
      title: 'Episode One',
      audioUrl: 'https://example.com/ep-1.mp3',
      pubDate: '2024-01-01T00:00:00.000Z',
      duration: 1200,
      description: 'Episode description',
      descriptionHtml: '<p>Episode description</p>',
    })
    addFavoriteMock.mockReset()
    removeFavoriteMock.mockReset()
    playEpisodeMock.mockReset()
    navigateMock.mockReset()
    episodeDetailDownloadButtonPropsSpy.mockReset()
    expandableDescriptionPropsSpy.mockReset()
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
    expect(playEpisodeMock).toHaveBeenCalledWith(resolvedEpisode, podcast, 'us')
  })

  it('renders plain-text episode descriptions in plain mode', () => {
    resolvedEpisode = makeFeedEpisode({
      episodeGuid: 'ep-plain',
      title: 'Plain Episode',
      audioUrl: 'https://example.com/plain.mp3',
      pubDate: '2024-01-02T00:00:00.000Z',
      description: 'Line one\nLine two',
      descriptionHtml: undefined,
    })

    render(<PodcastEpisodeDetailPage />)

    expect(expandableDescriptionPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Line one\nLine two',
        mode: 'plain',
      })
    )
  })

  it('renders HTML episode descriptions in html mode when descriptionHtml exists', () => {
    resolvedEpisode = makeFeedEpisode({
      episodeGuid: 'ep-html',
      title: 'HTML Episode',
      audioUrl: 'https://example.com/html.mp3',
      pubDate: '2024-01-03T00:00:00.000Z',
      description: 'Plain fallback',
      descriptionHtml: '<p><strong>Rich</strong> description</p>',
    })

    render(<PodcastEpisodeDetailPage />)

    expect(expandableDescriptionPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '<p><strong>Rich</strong> description</p>',
        mode: 'html',
      })
    )
  })
})
