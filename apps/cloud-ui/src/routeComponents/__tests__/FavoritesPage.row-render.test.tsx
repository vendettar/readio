import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import { PLAYBACK_REQUEST_MODE } from '../../lib/player/playbackMode'
import FavoritesPage from '../FavoritesPage'

const playFavoriteMock = vi.fn()
const removeFavoriteMock = vi.fn().mockResolvedValue(undefined)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playFavorite: playFavoriteMock,
  }),
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      favoritesLoaded: true,
      removeFavorite: removeFavoriteMock,
      favorites: [
        {
          id: 'fav-1',
          key: 'feed::audio',
          feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
          audioUrl: 'https://example.com/audio.mp3',
          episodeTitle: 'Episode Title',
          podcastTitle: 'Podcast',
          artworkUrl: '',
          addedAt: 1,
          countryAtSave: 'us',
        },
      ],
    }),
}))

vi.mock('../../hooks/useSubscriptionMap', () => ({
  useSubscriptionMap: () => new Map<string, string>(),
}))

vi.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}))

vi.mock('../../components/EpisodeRow', () => ({
  EpisodeListItem: ({
    model,
    onPlay,
    favorite,
    bottomMeta,
    menu,
  }: {
    model: { title: string }
    onPlay: () => void
    favorite?: { onToggle: () => Promise<void> | void }
    bottomMeta?: ReactNode
    menu?: ReactNode
  }) => (
    <div>
      <span>{model.title}</span>
      <button type="button" onClick={onPlay}>
        play-row
      </button>
      <button
        type="button"
        onClick={() => {
          void favorite?.onToggle()
        }}
      >
        toggle-favorite
      </button>
      {menu}
      {bottomMeta ? <div data-testid="bottom-meta">{bottomMeta}</div> : null}
    </div>
  ),
  fromFavorite: ({ favorite }: { favorite: { episodeTitle: string } }) => ({
    title: favorite.episodeTitle,
    route: null,
    playAriaLabel: 'btnPlayOnly',
  }),
}))

vi.mock('../../components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}))

vi.mock('../../components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}))

vi.mock('../../components/ui/empty-state', () => ({
  EmptyState: () => null,
}))

vi.mock('../../components/ui/loading-spinner', () => ({
  LoadingPage: () => null,
}))

vi.mock('../../components/ui/overflow-menu', () => ({
  OverflowMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../lib/dateUtils', () => ({
  formatRelativeTime: () => 'now',
}))

describe('FavoritesPage row render parity', () => {
  it('keeps play wiring, favorite toggle wiring, and bottom-meta visibility', async () => {
    render(<FavoritesPage />)

    fireEvent.click(screen.getByRole('button', { name: 'play-row' }))
    expect(playFavoriteMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'playWithoutTranscript' }))
    expect(playFavoriteMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fav-1' }),
      'us',
      expect.objectContaining({ mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT })
    )

    fireEvent.click(screen.getByRole('button', { name: 'toggle-favorite' }))
    expect(removeFavoriteMock).toHaveBeenCalledWith('feed::audio')

    expect(screen.getByTestId('bottom-meta')).toBeTruthy()
  })
})
