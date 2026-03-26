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
  default: { getPodcast: vi.fn() },
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

  it('passes active country to discovery fallback lookup when feedUrl is missing', async () => {
    mockCountry = 'jp'
    vi.mocked(discovery.getPodcast).mockResolvedValue({
      providerPodcastId: 999,
      collectionName: 'Show',
      artistName: 'Host',
      artworkUrl100: 'https://example.com/art-100.jpg',
      artworkUrl600: 'https://example.com/art-600.jpg',
      feedUrl: 'https://example.com/feed.xml',
      collectionViewUrl: 'https://example.com/show',
      genres: [],
    })

    const episode = {
      trackName: 'JP Episode',
      episodeUrl: 'https://example.com/audio.mp3',
      providerPodcastId: 999,
      providerEpisodeId: 123,
    } as unknown as SearchEpisode

    render(<SearchEpisodeItem episode={episode} onPlay={() => {}} />)

    const buildAddPayload = vi.mocked(useEpisodeRowFavoriteAction).mock.calls[0][0].buildAddPayload
    await buildAddPayload()

    expect(discovery.getPodcast).toHaveBeenCalledWith('999', 'jp')
  })

  it('throws error and does not call discovery.getPodcast if both feedUrl and providerPodcastId are missing', async () => {
    const episode = {
      trackName: 'Minimal',
      episodeUrl: 'http://cdn/a.mp3',
      // NO feedUrl
      // NO providerPodcastId
    } as unknown as SearchEpisode

    render(<SearchEpisodeItem episode={episode} onPlay={() => {}} />)

    const buildAddPayload = vi.mocked(useEpisodeRowFavoriteAction).mock.calls[0][0].buildAddPayload

    await expect(buildAddPayload()).rejects.toThrow('Missing providerPodcastId for metadata lookup')
    expect(discovery.getPodcast).not.toHaveBeenCalled()
  })

  it('renders play-without-transcript action and triggers callback', () => {
    const onPlayWithoutTranscript = vi.fn()
    const episode = {
      trackName: 'Episode',
      episodeUrl: 'https://example.com/audio.mp3',
      providerEpisodeId: 1,
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
