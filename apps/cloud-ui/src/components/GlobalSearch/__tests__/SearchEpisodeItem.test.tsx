import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import discovery, { type SearchEpisode } from '../../../lib/discovery'
import { useEpisodeRowFavoriteAction } from '../../EpisodeRow/useEpisodeRowFavoriteAction'
import { SearchEpisodeItem } from '../SearchEpisodeItem'

let mockCountry = 'us'

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { resolvedLanguage: 'en', language: 'en' },
    }),
    initReactI18next: { type: '3rdParty', init: vi.fn() },
  }
})

vi.mock('../../../lib/discovery', () => ({
  default: { getPodcastIndexPodcastByItunesId: vi.fn() },
}))

vi.mock('../../EpisodeRow/useEpisodeRowFavoriteAction', () => ({
  useEpisodeRowFavoriteAction: vi.fn((props) => ({
    toggleFavorite: () => props.buildAddPayload(),
  })),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: unknown) => unknown) =>
    selector({
      favorites: [],
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      country: mockCountry,
    }),
}))

vi.mock('../../EpisodeRow', () => ({
  EpisodeListItem: ({ menu, onPlay }: { menu?: ReactNode; onPlay: () => void }) => (
    <div>
      <button type="button" onClick={onPlay}>
        play-row
      </button>
      {menu}
    </div>
  ),
}))

vi.mock('../../ui/overflow-menu', () => ({
  OverflowMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}))

describe('SearchEpisodeItem favorite enrichment', () => {
  beforeEach(() => {
    mockCountry = 'us'
    vi.clearAllMocks()
  })

  it('uses PI search payload directly when favorite metadata is already sufficient', async () => {
    const episode = {
      title: 'JP Episode',
      podcastTitle: 'Search Show',
      feedUrl: 'https://example.com/feed.xml',
      episodeUrl: 'https://example.com/audio.mp3',
      podcastItunesId: '999',
      providerEpisodeId: '123',
      episodeGuid: 'episode-guid-123',
      image: 'https://example.com/episode-100.jpg',
      artwork: 'https://example.com/episode-600.jpg',
    } as unknown as SearchEpisode

    render(<SearchEpisodeItem episode={episode} onPlay={() => {}} />)

    const buildAddPayload = vi.mocked(useEpisodeRowFavoriteAction).mock.calls[0][0].buildAddPayload
    const payload = await buildAddPayload()

    expect(discovery.getPodcastIndexPodcastByItunesId).not.toHaveBeenCalled()
    expect(payload.podcast).toMatchObject({
      title: 'Search Show',
      feedUrl: 'https://example.com/feed.xml',
      podcastItunesId: '999',
      image: 'https://example.com/episode-100.jpg',
      artwork: 'https://example.com/episode-600.jpg',
    })
    expect(payload.episode).toMatchObject({
      id: 'episode-guid-123',
      title: 'JP Episode',
      audioUrl: 'https://example.com/audio.mp3',
      feedUrl: 'https://example.com/feed.xml',
      providerEpisodeId: '123',
      episodeGuid: 'episode-guid-123',
    })
  })

  it('falls back to explicit PI lookup when feedUrl is missing from the search payload', async () => {
    mockCountry = 'jp'
    vi.mocked(discovery.getPodcastIndexPodcastByItunesId).mockResolvedValue({
      podcastItunesId: '999',
      title: 'Show',
      author: 'Host',
      image: 'https://example.com/art-100.jpg',
      artwork: 'https://example.com/art-600.jpg',
      feedUrl: 'https://example.com/feed.xml',
      collectionViewUrl: 'https://example.com/show',
      genres: [],
    })

    const episode = {
      title: 'JP Episode',
      podcastTitle: 'Search Show',
      episodeUrl: 'https://example.com/audio.mp3',
      podcastItunesId: '999',
      providerEpisodeId: '123',
      episodeGuid: 'episode-guid-123',
    } as unknown as SearchEpisode

    render(<SearchEpisodeItem episode={episode} onPlay={() => {}} />)

    const buildAddPayload = vi.mocked(useEpisodeRowFavoriteAction).mock.calls[0][0].buildAddPayload
    const payload = await buildAddPayload()

    expect(discovery.getPodcastIndexPodcastByItunesId).toHaveBeenCalledWith('999')
    expect(payload.podcast.feedUrl).toBe('https://example.com/feed.xml')
    expect(payload.episode.providerEpisodeId).toBe('123')
    expect(payload.episode.episodeGuid).toBe('episode-guid-123')
  })

  it('throws error and does not call PI lookup if podcastItunesId is missing', async () => {
    const episode = {
      title: 'Minimal',
      episodeUrl: 'http://cdn/a.mp3',
    } as unknown as SearchEpisode

    render(<SearchEpisodeItem episode={episode} onPlay={() => {}} />)

    const buildAddPayload = vi.mocked(useEpisodeRowFavoriteAction).mock.calls[0][0].buildAddPayload

    await expect(buildAddPayload()).rejects.toThrow('Missing podcastItunesId for metadata lookup')
    expect(discovery.getPodcastIndexPodcastByItunesId).not.toHaveBeenCalled()
  })

  it('renders play-without-transcript action and triggers callback', () => {
    const onPlayWithoutTranscript = vi.fn()
    const episode = {
      title: 'Episode',
      episodeUrl: 'https://example.com/audio.mp3',
      providerEpisodeId: '1',
    } as unknown as SearchEpisode

    render(
      <SearchEpisodeItem
        episode={episode}
        onPlay={() => {}}
        onPlayWithoutTranscript={onPlayWithoutTranscript}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'playWithoutTranscript' }))
    expect(onPlayWithoutTranscript).toHaveBeenCalledTimes(1)
  })
})
