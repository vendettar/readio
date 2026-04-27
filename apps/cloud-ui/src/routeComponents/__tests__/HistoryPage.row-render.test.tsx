import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import HistoryPage from '../HistoryPage'

const setAudioUrlMock = vi.fn()
const playMock = vi.fn()
const setSessionIdMock = vi.fn()
const setPlaybackTrackIdMock = vi.fn()
const pauseMock = vi.fn()
const addFavoriteMock = vi.fn().mockResolvedValue(undefined)
const deleteSessionMock = vi.fn().mockResolvedValue(undefined)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
  fromPlaybackSession: ({ session }: { session: { title: string } }) => ({
    title: session.title,
    route: null,
    playAriaLabel: 'btnPlayOnly',
  }),
}))

vi.mock('../../components/ui/button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
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

vi.mock('../../hooks/useSubscriptionMap', () => ({
  useSubscriptionMap: () => new Map<string, string>(),
}))

vi.mock('../../hooks/useEpisodeStatus', () => ({
  useEpisodeStatus: () => ({ playable: true, disabledReason: null }),
}))

vi.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}))

vi.mock('../../lib/dateUtils', () => ({
  formatTimeSmart: () => 'time',
}))

vi.mock('../../lib/formatters', () => ({
  formatDateShort: () => 'date-short',
}))

vi.mock('../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setAudioUrl: setAudioUrlMock,
      play: playMock,
      sessionId: null,
      setSessionId: setSessionIdMock,
      suspendSessionPersistence: vi.fn(),
      setPlaybackTrackId: setPlaybackTrackIdMock,
      pause: pauseMock,
    }),
}))

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setPlayableContext: vi.fn(),
      toDocked: vi.fn(),
      toMini: vi.fn(),
    }),
}))

vi.mock('../../store/historyStore', () => ({
  useHistoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      sessions: [
        {
          id: 'session-1',
          source: 'explore',
          title: 'Episode',
          createdAt: 1,
          lastPlayedAt: 1,
          sizeBytes: 0,
          duration: 100,
          audioId: null,
          subtitleId: null,
          hasAudioBlob: false,
          progress: 10,
          audioFilename: 'audio.mp3',
          subtitleFilename: '',
          audioUrl: 'https://example.com/audio.mp3',
          localTrackId: 'track-1',
          podcastFeedUrl: 'feed',
          podcastItunesId: 123,
          countryAtSave: 'us',
          episodeGuid: 'guid-1',
        },
      ],
      artworkBlobs: {},
      isLoading: false,
      loadSessions: vi.fn().mockResolvedValue(undefined),
      resolveArtworkForSession: vi.fn(),
      deleteSession: deleteSessionMock,
      getAudioBlobForSession: vi.fn(),
    }),
}))

vi.mock('../../lib/remoteTranscript', () => ({
  getAsrSettingsSnapshot: vi.fn(() => ({
    asrProvider: 'groq',
    asrModel: 'whisper-large-v3',
  })),
  autoIngestEpisodeTranscript: vi.fn(),
  getValidTranscriptUrl: (url: string | null | undefined) => url || null,
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      favorites: [],
      addFavorite: addFavoriteMock,
      removeFavorite: vi.fn(),
    }),
}))

describe('HistoryPage row render parity', () => {
  it('keeps play wiring, favorite wiring, and bottom-meta visibility', async () => {
    render(<HistoryPage />)

    fireEvent.click(screen.getByRole('button', { name: 'play-row' }))
    await waitFor(() => expect(setAudioUrlMock).toHaveBeenCalled())
    // setPlaybackTrackId is called ONLY if a local track is resolved.
    expect(setPlaybackTrackIdMock).not.toHaveBeenCalled()
    expect(pauseMock).toHaveBeenCalled()
    await waitFor(() => expect(setSessionIdMock).toHaveBeenCalledWith('session-1'))
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'playWithoutTranscript' }))
    await waitFor(() => expect(setAudioUrlMock).toHaveBeenCalled())
    expect(setPlaybackTrackIdMock).toHaveBeenCalledWith(null)
    expect(pauseMock).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'toggle-favorite' }))
    await waitFor(() => expect(addFavoriteMock).toHaveBeenCalledTimes(1))

    expect(screen.getByTestId('bottom-meta')).toBeTruthy()
  })
})
