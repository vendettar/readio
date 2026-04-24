import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import { createQueryClientWrapper } from '../../../__tests__/queryClient'
import type { Podcast, SearchEpisode } from '../../../lib/discovery'
import { makePodcast, makeSearchEpisode } from '../../../lib/discovery/__tests__/fixtures'
import { ensurePodcastDetail } from '../../../lib/discovery/queryCache'
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

vi.mock('../../../lib/discovery/queryCache', () => ({
  ensurePodcastDetail: vi.fn(),
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

  it('always resolves podcast metadata through PI lookup for favorites', async () => {
    const lookupPodcast: Podcast = makePodcast({
      podcastItunesId: '999',
      title: 'Search Show',
      artwork: 'https://example.com/episode-600.jpg',
      feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
    })
    vi.mocked(ensurePodcastDetail).mockResolvedValue(lookupPodcast)

    const episode = makeSearchEpisode({
      title: 'JP Episode',
      showTitle: 'Search Show',
      episodeUrl: 'https://example.com/audio.mp3',
      episodeGuid: 'guid-jp-episode',
      podcastItunesId: '999',
      artwork: 'https://example.com/episode-600.jpg',
    })

    render(<SearchEpisodeItem episode={episode} onPlay={() => {}} />, {
      wrapper: createQueryClientWrapper(),
    })

    const buildAddPayload = vi.mocked(useEpisodeRowFavoriteAction).mock.calls[0][0].buildAddPayload
    const payload = await buildAddPayload()

    expect(ensurePodcastDetail).toHaveBeenCalledWith(expect.anything(), '999', 'us')
    expect(payload.podcast).toMatchObject({
      title: 'Search Show',
      feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
      podcastItunesId: '999',
      artwork: 'https://example.com/episode-600.jpg',
    })
    expect(payload.episode).toMatchObject({
      episodeGuid: 'guid-jp-episode',
      title: 'JP Episode',
      audioUrl: 'https://example.com/audio.mp3',
    })
  })

  it('looks up PI metadata even when search payload is minimal', async () => {
    mockCountry = 'jp'
    const lookupPodcast: Podcast = makePodcast({
      podcastItunesId: '999',
      title: 'Show',
      artwork: 'https://example.com/art-600.jpg',
      feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
    })
    vi.mocked(ensurePodcastDetail).mockResolvedValue(lookupPodcast)

    const episode = makeSearchEpisode({
      title: 'JP Episode',
      showTitle: 'Search Show',
      episodeUrl: 'https://example.com/audio.mp3',
      episodeGuid: 'guid-minimal',
      podcastItunesId: '999',
      artwork: 'https://example.com/episode-600.jpg',
    })

    render(<SearchEpisodeItem episode={episode} onPlay={() => {}} />, {
      wrapper: createQueryClientWrapper(),
    })

    const buildAddPayload = vi.mocked(useEpisodeRowFavoriteAction).mock.calls[0][0].buildAddPayload
    const payload = await buildAddPayload()

    expect(ensurePodcastDetail).toHaveBeenCalledWith(expect.anything(), '999', 'jp')
    expect(payload.podcast.feedUrl).toBe('https://example.com/feed.xml')
    expect(payload.episode.episodeGuid).toBe('guid-minimal')
    expect(payload.episode.audioUrl).toBe('https://example.com/audio.mp3')
  })

  it('throws error and does not call PI lookup if podcastItunesId is missing', async () => {
    const episode = makeSearchEpisode({
      title: 'Minimal',
      episodeUrl: 'http://cdn/a.mp3',
      episodeGuid: 'guid-missing-podcast',
      showTitle: 'Minimal Show',
      artwork: 'https://example.com/episode-600.jpg',
      podcastItunesId: '' as SearchEpisode['podcastItunesId'],
    })

    render(<SearchEpisodeItem episode={episode} onPlay={() => {}} />, {
      wrapper: createQueryClientWrapper(),
    })

    const buildAddPayload = vi.mocked(useEpisodeRowFavoriteAction).mock.calls[0][0].buildAddPayload

    await expect(buildAddPayload()).rejects.toThrow('Missing podcastItunesId for metadata lookup')
    expect(ensurePodcastDetail).not.toHaveBeenCalled()
  })

  it('renders play-without-transcript action and triggers callback', () => {
    const onPlayWithoutTranscript = vi.fn()
    const episode = makeSearchEpisode({
      title: 'Episode',
      episodeUrl: 'https://example.com/audio.mp3',
      episodeGuid: 'guid-play-without-transcript',
      showTitle: 'Search Show',
      artwork: 'https://example.com/episode-600.jpg',
      podcastItunesId: '999',
    })

    render(
      <SearchEpisodeItem
        episode={episode}
        onPlay={() => {}}
        onPlayWithoutTranscript={onPlayWithoutTranscript}
      />,
      { wrapper: createQueryClientWrapper() }
    )

    fireEvent.click(screen.getByRole('button', { name: 'playWithoutTranscript' }))
    expect(onPlayWithoutTranscript).toHaveBeenCalledTimes(1)
  })
})
