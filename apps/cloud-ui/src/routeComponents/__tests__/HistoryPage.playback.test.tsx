import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackSession } from '../../lib/db/types'
import { PLAYBACK_REQUEST_MODE } from '../../lib/player/playbackMode'
import HistoryPage from '../HistoryPage'

const {
  setAudioUrlMock,
  playMock,
  setSessionIdMock,
  setPlaybackTrackIdMock,
  pauseMock,
  loadAudioBlobMock,
  setSubtitlesMock,
  setPlayableContextMock,
  toDockedMock,
  toMiniMock,
  getAudioBlobForSessionMock,
  loadSessionSubtitleCuesMock,
  logErrorMock,
  playHistorySessionWithDepsMock,
} = vi.hoisted(() => ({
  setAudioUrlMock: vi.fn(),
  playMock: vi.fn(),
  setSessionIdMock: vi.fn(),
  setPlaybackTrackIdMock: vi.fn(),
  pauseMock: vi.fn(),
  loadAudioBlobMock: vi.fn(),
  setSubtitlesMock: vi.fn(),
  setPlayableContextMock: vi.fn(),
  toDockedMock: vi.fn(),
  toMiniMock: vi.fn(),
  getAudioBlobForSessionMock: vi.fn(),
  loadSessionSubtitleCuesMock: vi.fn(),
  logErrorMock: vi.fn(),
  playHistorySessionWithDepsMock: vi.fn(),
}))

let sessionsState: PlaybackSession[] = []
let artworkBlobsState: Record<string, Blob> = {}

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
  }: {
    model: { title: string }
    onPlay: () => void
    favorite?: { onToggle: () => Promise<void> | void }
  }) => (
    <div>
      <div>{model.title}</div>
      <button type="button" aria-label="btnPlayOnly" onClick={onPlay}>
        play
      </button>
      <button
        type="button"
        aria-label="toggle-favorite"
        onClick={() => {
          void favorite?.onToggle()
        }}
      >
        fav
      </button>
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
  Button: ({ children, ...rest }: { children: ReactNode; [key: string]: unknown }) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
}))

vi.mock('../../components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
  logError: logErrorMock,
}))

let mockEpoch = 0
vi.mock('../../lib/player/remotePlayback', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>
  return {
    ...actual,
    playHistorySessionWithDeps: (...args: unknown[]) => playHistorySessionWithDepsMock(...args),
    getPlaybackEpoch: () => mockEpoch,
    bumpPlaybackEpoch: () => ++mockEpoch,
  }
})

vi.mock('../../lib/remoteTranscript', () => ({
  autoIngestEpisodeTranscript: vi.fn(),
  getAsrSettingsSnapshot: vi.fn().mockReturnValue({
    asrProvider: 'groq',
    asrModel: 'whisper-large-v3',
  }),
}))

vi.mock('../../lib/player/localSessionRestore', () => ({
  loadSessionSubtitleCues: loadSessionSubtitleCuesMock,
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        setAudioUrl: setAudioUrlMock,
        play: playMock,
        sessionId: null,
        setSessionId: setSessionIdMock,
        suspendSessionPersistence: vi.fn(),
        setPlaybackTrackId: setPlaybackTrackIdMock,
        pause: pauseMock,
        loadAudioBlob: loadAudioBlobMock,
      }),
    {
      getState: () => ({
        loadAudioBlob: loadAudioBlobMock,
      }),
    }
  ),
}))

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setPlayableContext: setPlayableContextMock,
      toDocked: toDockedMock,
      toMini: toMiniMock,
    }),
}))

vi.mock('../../store/transcriptStore', () => ({
  useTranscriptStore: {
    getState: () => ({
      setSubtitles: setSubtitlesMock,
    }),
  },
}))

vi.mock('../../store/historyStore', () => ({
  useHistoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      sessions: sessionsState,
      artworkBlobs: artworkBlobsState,
      isLoading: false,
      loadSessions: vi.fn(),
      resolveArtworkForSession: vi.fn(),
      deleteSession: vi.fn(),
      getAudioBlobForSession: getAudioBlobForSessionMock,
    }),
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      favorites: [],
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
    }),
}))

function makeSession(overrides: Partial<PlaybackSession> = {}): PlaybackSession {
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
    podcastTitle: 'Podcast',
    localTrackId: 'track-1', // Note: with source='explore', this will NOT trigger setPlaybackTrackId
    ...overrides,
  }
}

describe('HistoryPage playback session wiring', () => {
  beforeEach(() => {
    sessionsState = [makeSession()]
    artworkBlobsState = {}
    setAudioUrlMock.mockReset()
    playMock.mockReset()
    setSessionIdMock.mockReset()
    setPlaybackTrackIdMock.mockReset()
    loadAudioBlobMock.mockReset()
    setPlayableContextMock.mockReset()
    toDockedMock.mockReset()
    toMiniMock.mockReset()
    pauseMock.mockReset()
    getAudioBlobForSessionMock.mockReset()
    setSubtitlesMock.mockReset()
    loadSessionSubtitleCuesMock.mockReset()
    loadSessionSubtitleCuesMock.mockResolvedValue(null)
    logErrorMock.mockReset()
    playHistorySessionWithDepsMock.mockReset()
    playHistorySessionWithDepsMock.mockImplementation(async (deps, session) => {
      deps.pause()
      deps.setAudioUrl(
        session.audioUrl ?? null,
        session.title,
        session.artworkUrl ?? '',
        null,
        true
      )
      deps.setSessionId?.(session.id)
      deps.play()
      return true
    })
  })

  it('delegates remote history playback to the shared helper with current player deps', async () => {
    render(<HistoryPage />)
    fireEvent.click(screen.getByLabelText('btnPlayOnly'))

    await waitFor(() =>
      expect(playHistorySessionWithDepsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          setAudioUrl: setAudioUrlMock,
          play: playMock,
          pause: pauseMock,
          setSessionId: setSessionIdMock,
          setPlaybackTrackId: setPlaybackTrackIdMock,
        }),
        expect.objectContaining({
          id: 'session-1',
          audioUrl: 'https://example.com/episode.mp3',
        }),
        { mode: PLAYBACK_REQUEST_MODE.DEFAULT }
      )
    )
    expect(setPlaybackTrackIdMock).not.toHaveBeenCalled()
  })

  it('opens docked for remote session without transcript', async () => {
    render(<HistoryPage />)
    fireEvent.click(screen.getByLabelText('btnPlayOnly'))

    await waitFor(() => expect(setPlayableContextMock).toHaveBeenCalledWith(true))
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
  })

  it('opens docked for remote session with transcript', async () => {
    sessionsState = [makeSession({ transcriptUrl: 'https://example.com/episode.vtt' })]

    render(<HistoryPage />)
    fireEvent.click(screen.getByLabelText('btnPlayOnly'))

    await waitFor(() => expect(setPlayableContextMock).toHaveBeenCalledWith(true))
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
  })

  it('uses resolved artwork blob for local session playback when available', async () => {
    const localSession = makeSession({
      id: 'session-local-1',
      source: 'local',
      audioUrl: undefined,
      audioId: 'audio-1',
      artworkUrl: 'https://example.com/fallback.jpg',
    })
    const artworkBlob = new Blob(['cover'], { type: 'image/jpeg' })
    const audioBlob = new Blob(['audio'], { type: 'audio/mpeg' })

    sessionsState = [localSession]
    artworkBlobsState = { [localSession.id]: artworkBlob }
    getAudioBlobForSessionMock.mockResolvedValue(audioBlob)

    render(<HistoryPage />)
    fireEvent.click(screen.getByLabelText('btnPlayOnly'))

    await waitFor(() => expect(loadAudioBlobMock).toHaveBeenCalledTimes(1))
    expect(loadAudioBlobMock).toHaveBeenCalledWith(
      audioBlob,
      localSession.title,
      artworkBlob,
      localSession.id,
      undefined,
      expect.objectContaining({
        durationSeconds: localSession.durationSeconds,
      })
    )
    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    await waitFor(() => expect(playMock).toHaveBeenCalled())
  })

  it('prevents stale local playback from overriding newer one (Epoch Guard)', async () => {
    mockEpoch = 100 // Reset/Set initial epoch
    const s1 = makeSession({ id: 's1', source: 'local', audioId: 'a1', audioUrl: undefined })
    const s2 = makeSession({ id: 's2', source: 'local', audioId: 'a2', audioUrl: undefined })
    sessionsState = [s1, s2]

    // s1 will be slow
    getAudioBlobForSessionMock.mockImplementation(async (id) => {
      if (id === 'a1') {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return new Blob(['audio1'])
      }
      return new Blob(['audio2'])
    })

    render(<HistoryPage />)
    const playButtons = screen.getAllByLabelText('btnPlayOnly')

    // Click s1 (old), then click s2 (new) immediately
    fireEvent.click(playButtons[0])
    fireEvent.click(playButtons[1])

    await waitFor(() => expect(loadAudioBlobMock).toHaveBeenCalledTimes(1))
    // Only s2 (the latest) should have called loadAudioBlob successfully
    expect(loadAudioBlobMock).toHaveBeenCalledWith(
      expect.anything(),
      s2.title,
      expect.anything(),
      s2.id,
      undefined,
      expect.objectContaining({
        durationSeconds: s2.durationSeconds,
      })
    )
    expect(loadAudioBlobMock).not.toHaveBeenCalledWith(
      expect.anything(),
      s1.title,
      expect.anything(),
      s1.id,
      undefined,
      expect.anything()
    )
  })

  it('restores subtitles for local session when subtitle snapshot exists', async () => {
    const localSession = makeSession({
      id: 'session-local-subtitle',
      source: 'local',
      audioUrl: undefined,
      audioId: 'audio-subtitle',
      subtitleId: 'subtitle-1',
    })
    sessionsState = [localSession]
    getAudioBlobForSessionMock.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }))
    loadSessionSubtitleCuesMock.mockResolvedValue([{ start: 0, end: 1, text: 'restored cue' }])

    render(<HistoryPage />)
    fireEvent.click(screen.getByLabelText('btnPlayOnly'))

    await waitFor(() => expect(loadAudioBlobMock).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(loadSessionSubtitleCuesMock).toHaveBeenCalledWith(localSession)
      expect(setSubtitlesMock).toHaveBeenCalledWith([{ start: 0, end: 1, text: 'restored cue' }])
    })
  })

  it('keeps local playback when subtitle restore throws', async () => {
    const localSession = makeSession({
      id: 'session-local-subtitle-error',
      source: 'local',
      audioUrl: undefined,
      audioId: 'audio-subtitle-error',
      subtitleId: 'subtitle-err',
    })
    sessionsState = [localSession]
    getAudioBlobForSessionMock.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }))
    loadSessionSubtitleCuesMock.mockRejectedValue(new Error('subtitle read failed'))

    render(<HistoryPage />)
    fireEvent.click(screen.getByLabelText('btnPlayOnly'))

    await waitFor(() => expect(loadAudioBlobMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(playMock).toHaveBeenCalled())
    expect(loadSessionSubtitleCuesMock).toHaveBeenCalledWith(localSession)
    expect(setSubtitlesMock).not.toHaveBeenCalled()
  })

  it('logs and skips playback when local audio blob is missing', async () => {
    const localSession = makeSession({
      id: 'session-local-missing-audio',
      source: 'local',
      audioUrl: undefined,
      audioId: 'audio-missing',
    })
    sessionsState = [localSession]
    getAudioBlobForSessionMock.mockResolvedValue(null)

    render(<HistoryPage />)
    fireEvent.click(screen.getByLabelText('btnPlayOnly'))

    await waitFor(() => expect(getAudioBlobForSessionMock).toHaveBeenCalledWith('audio-missing'))
    expect(loadAudioBlobMock).not.toHaveBeenCalled()
    expect(playMock).not.toHaveBeenCalled()
    expect(logErrorMock).toHaveBeenCalledWith(
      '[History] Missing local audio blob for session playback',
      expect.objectContaining({
        sessionId: 'session-local-missing-audio',
        audioId: 'audio-missing',
      })
    )
  })
})
