import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExplorePlaybackSession, PlaybackSession } from '../../lib/db/types'
import HistoryPage from '../HistoryPage'

const {
  setAudioUrlMock,
  startPlaybackMock,
  setSessionIdMock,
  setPlaybackTrackIdMock,
  pauseMock,
  setPlayableContextMock,
  toDockedMock,
  toMiniMock,
  suspendSessionPersistenceMock,
  addFavoriteMock,
  removeFavoriteMock,
  autoIngestEpisodeTranscriptMock,
  loadSessionsMock,
  deleteSessionMock,
} = vi.hoisted(() => ({
  setAudioUrlMock: vi.fn(),
  startPlaybackMock: vi.fn(),
  setSessionIdMock: vi.fn(),
  setPlaybackTrackIdMock: vi.fn(),
  pauseMock: vi.fn(),
  setPlayableContextMock: vi.fn(),
  toDockedMock: vi.fn(),
  toMiniMock: vi.fn(),
  suspendSessionPersistenceMock: vi.fn(),
  addFavoriteMock: vi.fn(),
  removeFavoriteMock: vi.fn(),
  autoIngestEpisodeTranscriptMock: vi.fn(),
  loadSessionsMock: vi.fn(),
  deleteSessionMock: vi.fn(),
}))

let sessionsState: PlaybackSession[] = []
let currentSessionIdState: string | null = null

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
    menu,
  }: {
    model: { title: string }
    onPlay: () => void
    favorite?: { onToggle: () => Promise<void> | void }
    menu?: ReactNode
  }) => (
    <div>
      <div>{model.title}</div>
      <button type="button" aria-label="btnPlayOnly" onClick={onPlay}>
        play
      </button>
      <button
        type="button"
        aria-label="ariaAddFavorite"
        onClick={() => {
          void favorite?.onToggle()
        }}
      >
        fav
      </button>
      {menu}
    </div>
  ),
  fromPlaybackSession: ({ session }: { session: { title: string } }) => ({
    title: session.title,
    route: null,
    playAriaLabel: 'btnPlayOnly',
  }),
}))

vi.mock('../../components/interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: ({ onPlay }: { onPlay: () => void }) => (
    <button type="button" aria-label="play-artwork" onClick={onPlay}>
      play
    </button>
  ),
}))

vi.mock('../../components/interactive/InteractiveTitle', () => ({
  InteractiveTitle: ({ title, onClick }: { title: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}))

vi.mock('../../components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: {
    children: ReactNode
    onClick?: () => void
    [key: string]: unknown
  }) => (
    <button type="button" onClick={onClick} {...rest}>
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
  EmptyState: () => <div>empty</div>,
}))

vi.mock('../../components/ui/loading-spinner', () => ({
  LoadingPage: () => <div>loading</div>,
}))

vi.mock('../../components/ui/overflow-menu', () => ({
  OverflowMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../hooks/useSubscriptionMap', () => ({
  useSubscriptionMap: () => new Map<string, string>(),
}))

vi.mock('../../lib/dateUtils', () => ({
  formatDateStandard: () => 'date',
  formatDuration: () => 'duration',
  formatTimeSmart: () => 'time',
}))

vi.mock('../../lib/formatters', () => ({
  formatDateShort: () => 'date-short',
}))

vi.mock('../../lib/htmlUtils', () => ({
  stripHtml: (value: string) => value,
}))

vi.mock('../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../lib/remoteTranscript', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remoteTranscript')>()
  return {
    ...actual,
    getAsrSettingsSnapshot: vi.fn(() => ({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3',
    })),
    autoIngestEpisodeTranscript: autoIngestEpisodeTranscriptMock,
  }
})

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setAudioUrl: setAudioUrlMock,
      play: startPlaybackMock,
      sessionId: currentSessionIdState,
      setSessionId: setSessionIdMock,
      suspendSessionPersistence: suspendSessionPersistenceMock,
      setPlaybackTrackId: setPlaybackTrackIdMock,
      pause: pauseMock,
    }),
}))

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setPlayableContext: setPlayableContextMock,
      toDocked: toDockedMock,
      toMini: toMiniMock,
    }),
}))

vi.mock('../../store/historyStore', () => ({
  useHistoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      sessions: sessionsState,
      artworkBlobs: {},
      isLoading: false,
      loadSessions: loadSessionsMock,
      resolveArtworkForSession: vi.fn(),
      deleteSession: deleteSessionMock,
      getAudioBlobForSession: vi.fn(),
    }),
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      favorites: [],
      addFavorite: addFavoriteMock,
      removeFavorite: removeFavoriteMock,
    }),
}))

function makeSession(overrides: Partial<ExplorePlaybackSession> = {}): PlaybackSession {
  return {
    id: 'session-1',
    source: 'explore',
    title: 'Episode',
    createdAt: 1,
    lastPlayedAt: 1,
    sizeBytes: 0,
    durationSeconds: 1800,
    audioId: null,
    subtitleId: null,
    hasAudioBlob: false,
    progress: 120,
    audioFilename: 'episode.mp3',
    subtitleFilename: '',
    audioUrl: 'https://example.com/episode.mp3',
    podcastFeedUrl: 'https://example.com/feed.xml',
    podcastItunesId: '123456789',
    episodeGuid: 'episode-guid-1',
    podcastTitle: 'Podcast',
    transcriptUrl: 'https://example.com/episode.srt',
    countryAtSave: 'us',
    ...overrides,
  }
}

describe('HistoryPage transcript behavior', () => {
  beforeEach(() => {
    sessionsState = [makeSession()]
    currentSessionIdState = null
    setAudioUrlMock.mockReset()
    startPlaybackMock.mockReset()
    setSessionIdMock.mockReset()
    setPlaybackTrackIdMock.mockReset()
    setPlayableContextMock.mockReset()
    toDockedMock.mockReset()
    toMiniMock.mockReset()
    suspendSessionPersistenceMock.mockReset()
    pauseMock.mockReset()
    autoIngestEpisodeTranscriptMock.mockReset()
    addFavoriteMock.mockReset()
    removeFavoriteMock.mockReset()
    loadSessionsMock.mockReset()
    deleteSessionMock.mockReset()

    addFavoriteMock.mockResolvedValue(undefined)
    removeFavoriteMock.mockResolvedValue(undefined)
    loadSessionsMock.mockResolvedValue(undefined)
    deleteSessionMock.mockResolvedValue(undefined)
  })

  it('plays a history podcast session with transcript ingestion', async () => {
    render(<HistoryPage />)

    fireEvent.click(screen.getByLabelText('btnPlayOnly'))

    await waitFor(() =>
      expect(setAudioUrlMock).toHaveBeenCalledWith(
        'https://example.com/episode.mp3',
        'Episode',
        '',
        expect.objectContaining({
          transcriptUrl: 'https://example.com/episode.srt',
        }),
        true
      )
    )
    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalled()
    expect(pauseMock).toHaveBeenCalled()
    // play() is called after async operations inside playHistorySessionWithDeps
    await waitFor(() => expect(startPlaybackMock).toHaveBeenCalled())
    await waitFor(() =>
      expect(autoIngestEpisodeTranscriptMock).toHaveBeenCalledWith(
        'https://example.com/episode.srt',
        'https://example.com/episode.mp3'
      )
    )
  })

  it('passes transcriptUrl when adding a history session to favorites', async () => {
    render(<HistoryPage />)

    fireEvent.click(screen.getByLabelText('ariaAddFavorite'))

    await waitFor(() => expect(addFavoriteMock).toHaveBeenCalled())
    const [, episodeArg] = addFavoriteMock.mock.calls[0]
    expect((episodeArg as { transcriptUrl?: string }).transcriptUrl).toBe(
      'https://example.com/episode.srt'
    )
  })

  it('suspends session persistence when deleting the active history session', async () => {
    currentSessionIdState = 'session-1'

    render(<HistoryPage />)
    fireEvent.click(screen.getByText('commonDelete'))

    await waitFor(() => expect(deleteSessionMock).toHaveBeenCalledWith('session-1'))
    expect(suspendSessionPersistenceMock).toHaveBeenCalled()
  })
})
