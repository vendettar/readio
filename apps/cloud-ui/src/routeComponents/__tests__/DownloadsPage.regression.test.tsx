import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackSession, PodcastDownload } from '../../lib/db/types'
import { getAllDownloadedTracks } from '../../lib/downloadService'
import { selectPlaybackSubtitle } from '../../lib/downloads/subtitleSelection'
import { canPlayRemoteStreamWithoutTranscript } from '../../lib/player/remotePlayback'
import {
  DownloadsRepository,
  subscribeToDownloadSubtitles,
} from '../../lib/repositories/DownloadsRepository'
import { toast } from '../../lib/toast'
import DownloadsPage from '../DownloadsPage'

const downloadTrackCardPropsSpy = vi.fn()
let subtitleChangeCallback: ((trackId: string) => void) | null = null
type ReadySubtitle = Awaited<
  ReturnType<typeof DownloadsRepository.getReadySubtitlesByTrackId>
>[number]
type SubtitleSelection = ReadySubtitle | undefined
type DownloadedSubtitle = Awaited<ReturnType<typeof DownloadsRepository.getTrackSubtitles>>[number]
type PlayerStoreSlice = {
  setAudioUrl: typeof setAudioUrlMock
  play: typeof playMock
  pause: typeof pauseMock
  setSessionId: typeof setSessionIdMock
  seekTo: typeof seekToMock
  queueAutoplayAfterPendingSeek: typeof queueAutoplayAfterPendingSeekMock
  setPlaybackTrackId: typeof setPlaybackTrackIdMock
}
type TranscriptStoreSlice = {
  setSubtitles: typeof setSubtitlesMock
}
type PlayerSurfaceStoreSlice = {
  setPlayableContext: typeof setPlayableContextMock
  toDocked: typeof toDockedMock
}
type ExploreStoreSlice = {
  country: string
  favorites: unknown[]
}
type FilesStoreSlice = {
  getSetting: typeof getSettingMock
  setSetting: typeof setSettingMock
}

function makeDownloadedTrack(
  overrides: Partial<PodcastDownload> & Pick<PodcastDownload, 'id' | 'name' | 'sourceUrlNormalized'>
): PodcastDownload {
  return {
    audioId: 'audio-id',
    sourceType: 'podcast_download',
    sizeBytes: 1024,
    createdAt: 1,
    lastAccessedAt: 1,
    downloadedAt: 1,
    countryAtSave: 'US',
    ...overrides,
  }
}

function createSelectorMock<TState extends object>(state: TState) {
  return (selector: (value: TState) => unknown) => selector(state)
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: { children?: ReactNode; to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

// Mock components to avoid deep rendering issues
vi.mock('../../components/Downloads/DownloadTrackCard', () => ({
  DownloadTrackCard: (props: {
    onPlay: () => void
    onPlayWithoutTranscript?: () => void
    onImportSubtitle?: () => void
    onRetranscribe?: () => void
    showPlayWithoutTranscriptAction?: boolean
    subtitles?: unknown[]
  }) => {
    downloadTrackCardPropsSpy(props)
    return (
      <div>
        <button type="button" onClick={() => props.onPlay()} aria-label="play-track">
          Play
        </button>
        {props.showPlayWithoutTranscriptAction && props.onPlayWithoutTranscript ? (
          <button
            type="button"
            onClick={() => props.onPlayWithoutTranscript?.()}
            aria-label="playWithoutTranscript"
          >
            PlayWithoutTranscript
          </button>
        ) : null}
        {props.onImportSubtitle ? (
          <button
            type="button"
            onClick={() => props.onImportSubtitle?.()}
            aria-label="import-subtitle"
          >
            ImportSubtitle
          </button>
        ) : null}
        {props.onRetranscribe ? (
          <button type="button" onClick={() => props.onRetranscribe?.()} aria-label="retranscribe">
            Retranscribe
          </button>
        ) : null}
        <div>Subs: {props.subtitles?.length || 0}</div>
      </div>
    )
  },
}))

vi.mock('../../components/OfflineBanner', () => ({
  OfflineBanner: () => null,
}))

vi.mock('../../components/ui/confirm-alert-dialog', () => ({
  ConfirmAlertDialog: () => null,
}))

vi.mock('../../components/Files/ViewControlsBar', () => ({
  ViewControlsBar: ({
    density,
    onDensityChange,
  }: {
    density: 'comfortable' | 'compact'
    onDensityChange: (density: 'comfortable' | 'compact') => void
  }) => (
    <div>
      <button
        type="button"
        aria-label="density-comfortable"
        onClick={() => onDensityChange('comfortable')}
      >
        comfortable
      </button>
      <button type="button" aria-label="density-compact" onClick={() => onDensityChange('compact')}>
        compact
      </button>
      <span data-testid="density-current">{density}</span>
    </div>
  ),
}))

// Mock hooks and stores
const setAudioUrlMock = vi.fn()
const setSubtitlesMock = vi.fn()
const playMock = vi.fn()
const pauseMock = vi.fn()
const setSessionIdMock = vi.fn()
const seekToMock = vi.fn()
const queueAutoplayAfterPendingSeekMock = vi.fn()
const setPlaybackTrackIdMock = vi.fn()
const setPlayableContextMock = vi.fn()
const toDockedMock = vi.fn()
const getSettingMock = vi.fn().mockResolvedValue(null)
const setSettingMock = vi.fn().mockResolvedValue(undefined)
let isOnlineMock = true
const playStreamWithoutTranscriptWithDepsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ started: true, reason: 'started' })
)
const retranscribeDownloadedTrackWithCurrentSettingsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, reason: 'success' })
)

vi.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: isOnlineMock }),
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: PlayerStoreSlice) => unknown) =>
    createSelectorMock({
      setAudioUrl: setAudioUrlMock,
      play: playMock,
      pause: pauseMock,
      setSessionId: setSessionIdMock,
      seekTo: seekToMock,
      queueAutoplayAfterPendingSeek: queueAutoplayAfterPendingSeekMock,
      setPlaybackTrackId: setPlaybackTrackIdMock,
    })(selector),
}))

vi.mock('../../store/transcriptStore', () => ({
  useTranscriptStore: (selector: (state: TranscriptStoreSlice) => unknown) =>
    createSelectorMock({
      setSubtitles: setSubtitlesMock,
    })(selector),
  TRANSCRIPT_INGESTION_STATUS: {
    IDLE: 'idle',
    LOADING: 'loading',
    TRANSCRIBING: 'transcribing',
    FAILED: 'failed',
  } as const,
}))

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: (selector: (state: PlayerSurfaceStoreSlice) => unknown) =>
    createSelectorMock({
      setPlayableContext: setPlayableContextMock,
      toDocked: toDockedMock,
    })(selector),
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: ExploreStoreSlice) => unknown) =>
    createSelectorMock({
      country: 'US',
      favorites: [],
    })(selector),
}))

vi.mock('../../store/filesStore', () => ({
  useFilesStore: (selector: (state: FilesStoreSlice) => unknown) =>
    createSelectorMock({
      getSetting: getSettingMock,
      setSetting: setSettingMock,
    })(selector),
}))

// Mock repositories and services
vi.mock('../../lib/downloadService', () => ({
  getAllDownloadedTracks: vi.fn(),
  subscribeToDownloads: vi.fn(() => () => {}),
}))

vi.mock('../../lib/download', () => ({
  downloadBlob: vi.fn(),
}))

vi.mock('../../lib/repositories/DownloadsRepository', () => ({
  subscribeToDownloadSubtitles: vi.fn((listener: (trackId: string) => void) => {
    subtitleChangeCallback = listener
    return () => {
      if (subtitleChangeCallback === listener) {
        subtitleChangeCallback = null
      }
    }
  }),
  DownloadsRepository: {
    getReadySubtitlesByTrackId: vi.fn(),
    getRestoreSessionByTrackId: vi.fn(),
    getTrackArtworkBlob: vi.fn(),
    getTrackSubtitles: vi.fn(),
    importSubtitleVersion: vi.fn(),
    exportActiveTranscriptVersion: vi.fn(),
    exportAudioFile: vi.fn(),
  },
}))

vi.mock('../../lib/player/playbackSource', () => ({
  resolvePlaybackSource: vi.fn().mockResolvedValue({ url: 'blob:audio' }),
}))

vi.mock('../../lib/player/remotePlayback', () => ({
  PLAYBACK_START_REASON: {
    STARTED: 'started',
    STALE: 'stale',
    NO_PLAYABLE_SOURCE: 'no_playable_source',
    DOWNLOAD_FAILED: 'download_failed',
  } as const,
  canPlayRemoteStreamWithoutTranscript: vi
    .fn()
    .mockImplementation(
      (candidates: { sourceUrlNormalized?: string; audioUrl?: string }, isOnline: boolean) => {
        if (!isOnline) return false
        const candidate = candidates.sourceUrlNormalized ?? candidates.audioUrl ?? ''
        return /^https?:\/\//i.test(candidate.trim())
      }
    ),
  playStreamWithoutTranscriptWithDeps: playStreamWithoutTranscriptWithDepsMock,
}))

vi.mock('../../lib/remoteTranscript', () => ({
  RETRANSCRIBE_DOWNLOAD_REASON: {
    SUCCESS: 'success',
    TRACK_NOT_FOUND: 'track_not_found',
    INVALID_SOURCE: 'invalid_source',
    UNCONFIGURED: 'unconfigured',
    IN_FLIGHT: 'in_flight',
    FAILED: 'failed',
    ENQUEUE_FAILED: 'enqueue_failed',
  } as const,
  retranscribeDownloadedTrackWithCurrentSettings:
    retranscribeDownloadedTrackWithCurrentSettingsMock,
}))

vi.mock('../../lib/downloads/subtitleSelection', () => ({
  selectPlaybackSubtitle: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  logError: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    errorKey: vi.fn(),
    successKey: vi.fn(),
  },
}))

describe('DownloadsPage Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isOnlineMock = true
    getSettingMock.mockResolvedValue(null)
    vi.mocked(DownloadsRepository.getRestoreSessionByTrackId).mockResolvedValue(undefined)
    vi.mocked(DownloadsRepository.getTrackArtworkBlob).mockResolvedValue(null)
    vi.mocked(DownloadsRepository.getTrackSubtitles).mockResolvedValue([])
    subtitleChangeCallback = null
    playStreamWithoutTranscriptWithDepsMock.mockResolvedValue({ started: true, reason: 'started' })
    retranscribeDownloadedTrackWithCurrentSettingsMock.mockResolvedValue({
      ok: true,
      reason: 'success',
    })
    vi.mocked(DownloadsRepository.importSubtitleVersion).mockResolvedValue({
      ok: true,
      reason: 'imported',
      fileSubtitleId: 'new-subtitle-id',
    })
  })

  it('calls setSubtitlesStore([]) when no target subtitle is found during playback', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-1',
      name: 'Test Track',
      sourceUrlNormalized: 'http://example.com/audio.mp3',
    })

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)

    render(<DownloadsPage />)

    // Wait for the track to load and render
    await waitFor(() => {
      expect(screen.getByLabelText('play-track')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('play-track'))

    await waitFor(() => {
      expect(setSubtitlesMock).toHaveBeenCalledWith([])
    })
  })

  it('calls setSubtitlesStore with cues when target subtitle is found', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-1',
      name: 'Test Track',
      sourceUrlNormalized: 'http://example.com/audio.mp3',
    })
    const mockCues = [{ start: 0, end: 1, text: 'Hello' }]
    const subtitleText = {
      id: 'subtitle-1',
      cues: mockCues,
      cueSchemaVersion: 1,
      size: 1,
      filename: 'English.srt',
      storedAt: 1,
    }
    const mockTarget: NonNullable<SubtitleSelection> = {
      fileSub: {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'English',
      },
      subtitle: subtitleText,
    }
    const mockSubtitle: ReadySubtitle = {
      fileSub: {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'English',
      },
      subtitle: subtitleText,
    }

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([mockSubtitle])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(mockTarget)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('play-track')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('play-track'))

    await waitFor(() => {
      expect(setSubtitlesMock).toHaveBeenCalledWith(mockCues)
    })
  })

  it('imports subtitle file from downloads card action', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-1',
      name: 'Test Track',
      sourceUrlNormalized: 'http://example.com/audio.mp3',
    })
    const subtitleFile = new File(['1\n00:00:00,000 --> 00:00:01,000\nhello\n'], 'imported.srt', {
      type: 'application/x-subrip',
    })

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('import-subtitle')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('import-subtitle'))

    const input = screen.getByTestId('downloads-subtitle-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [subtitleFile] } })

    await waitFor(() => {
      expect(DownloadsRepository.importSubtitleVersion).toHaveBeenCalledWith('track-1', {
        filename: 'imported.srt',
        content: '1\n00:00:00,000 --> 00:00:01,000\nhello\n',
      })
    })
  })

  it('refreshes subtitle rows when download subtitle mutations are notified', async () => {
    const mockTrack = {
      id: 'track-subscription-refresh',
      name: 'Subscription Refresh Track',
      sourceUrlNormalized: 'http://example.com/audio.mp3',
    }
    const subtitleMutationListeners: Array<(trackId: string) => void> = []

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack as PodcastDownload])
    vi.mocked(DownloadsRepository.getTrackSubtitles)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'sub-1',
          trackId: 'track-subscription-refresh',
          subtitleId: 'subtitle-1',
          name: 'Imported subtitle',
          sourceKind: 'manual_upload',
          status: 'ready',
          createdAt: Date.now(),
        },
      ])
    vi.mocked(subscribeToDownloadSubtitles).mockImplementation((cb) => {
      subtitleMutationListeners.push(cb)
      return () => {}
    })

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByText('Subs: 0')).toBeDefined()
    })

    await waitFor(() => {
      expect(subtitleMutationListeners).toHaveLength(1)
    })

    subtitleMutationListeners[0]?.('track-subscription-refresh')

    await waitFor(() => {
      expect(screen.getByText('Subs: 1')).toBeDefined()
    })
  })

  it('triggers retranscribe action for the selected download track', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-1',
      name: 'Test Track',
      sourceUrlNormalized: 'http://example.com/audio.mp3',
    })

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('retranscribe')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('retranscribe'))

    await waitFor(() => {
      expect(retranscribeDownloadedTrackWithCurrentSettingsMock).toHaveBeenCalledWith('track-1')
    })
  })

  it('shows ASR settings error and navigates when retranscribe is unconfigured', async () => {
    const mockTrack: PodcastDownload = {
      id: 'track-unconfigured',
      name: 'Unconfigured Track',
      audioId: 'audio-track-unconfigured',
      sizeBytes: 3072,
      createdAt: 3,
      sourceType: 'podcast_download',
      sourceUrlNormalized: 'https://example.com/audio.mp3',
      lastAccessedAt: 3,
      downloadedAt: 3,
      countryAtSave: 'US',
    }

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    retranscribeDownloadedTrackWithCurrentSettingsMock.mockResolvedValue({
      ok: false,
      reason: 'unconfigured',
    })
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('retranscribe')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('retranscribe'))

    await waitFor(() => {
      expect(toast.errorKey).toHaveBeenCalledWith('asrKeyInvalid')
    })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'readio:navigate',
      })
    )
    dispatchSpy.mockRestore()
  })

  it('isolates artwork loading failure from subtitle loading', async () => {
    // 1. Setup mock track with artworkId
    const mockTrack = makeDownloadedTrack({
      id: 'track-fail-artwork',
      name: 'Fail Artwork Track',
      artworkId: 'art-1',
      sourceUrlNormalized: 'http://example.com/fail-art.mp3',
    })
    const mockSubs = [{ id: 's1', name: 'Sub 1' }] as DownloadedSubtitle[]

    // 2. Setup repository mocks
    // Mock artwork lookup to fail
    vi.mocked(DownloadsRepository.getTrackArtworkBlob).mockRejectedValue(
      new Error('Persistent error')
    )
    // Mock subtitle lookup to succeed
    vi.mocked(DownloadsRepository.getTrackSubtitles).mockResolvedValue(mockSubs)

    // 3. Setup track mock
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])

    // 4. Render
    render(<DownloadsPage />)

    // 5. Verify subtitles were loaded by checking the mock component (it renders subtitle count if we update it)
    await waitFor(() => {
      expect(screen.getByText('Subs: 1')).toBeDefined()
    })
    expect(DownloadsRepository.getTrackSubtitles).toHaveBeenCalledWith('track-fail-artwork')
  })

  it('queues autoplay-after-seek instead of immediate play when resumable progress exists', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-resume',
      name: 'Resume Track',
      sourceUrlNormalized: 'http://example.com/resume.mp3',
    })

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)
    vi.mocked(DownloadsRepository.getRestoreSessionByTrackId).mockResolvedValue({
      progress: 42,
      durationSeconds: 300,
    } as PlaybackSession)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('play-track')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('play-track'))

    await waitFor(() => {
      expect(queueAutoplayAfterPendingSeekMock).toHaveBeenCalledTimes(1)
      expect(seekToMock).toHaveBeenCalledWith(42)
    })
    expect(playMock).not.toHaveBeenCalled()
  })

  it('hydrates compact density from persisted downloads setting', async () => {
    getSettingMock.mockResolvedValue('compact')
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([])

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(getSettingMock).toHaveBeenCalledWith('downloads.viewDensity')
      expect(screen.getByTestId('density-current').textContent).toBe('compact')
    })
  })

  it('persists density changes to downloads setting key', async () => {
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([])

    render(<DownloadsPage />)

    fireEvent.click(screen.getByLabelText('density-compact'))

    await waitFor(() => {
      expect(setSettingMock).toHaveBeenCalledWith('downloads.viewDensity', 'compact')
    })
  })

  it('dispatches stream-without-transcript action from downloads overflow', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-stream',
      name: 'Stream Track',
      sourceUrlNormalized: 'https://example.com/stream.mp3',
      durationSeconds: 300,
    })
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)
    vi.mocked(DownloadsRepository.getRestoreSessionByTrackId).mockResolvedValue({
      id: 'local-track-track-stream',
      progress: 66,
      durationSeconds: 300,
    } as PlaybackSession)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('playWithoutTranscript')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('playWithoutTranscript'))

    await waitFor(() => {
      expect(playStreamWithoutTranscriptWithDepsMock).toHaveBeenCalledTimes(1)
      expect(playStreamWithoutTranscriptWithDepsMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          metadata: expect.objectContaining({
            durationSeconds: 300,
          }),
        })
      )
      expect(setSubtitlesMock).not.toHaveBeenCalledWith(expect.any(Array))
      expect(setSessionIdMock).toHaveBeenCalledWith('local-track-track-stream')
      expect(queueAutoplayAfterPendingSeekMock).toHaveBeenCalledTimes(1)
      expect(seekToMock).toHaveBeenCalledWith(66)
    })
  })

  it('preserves built-in transcriptUrl when playing without transcript from downloads', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-stream-transcript',
      name: 'Stream Track With Transcript',
      sourceUrlNormalized: 'https://example.com/stream.mp3',
      transcriptUrl: 'https://example.com/transcript.vtt',
      durationSeconds: 300,
    })
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('playWithoutTranscript')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('playWithoutTranscript'))

    await waitFor(() => {
      expect(playStreamWithoutTranscriptWithDepsMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptUrl: 'https://example.com/transcript.vtt',
          }),
        })
      )
    })
  })

  it('passes durationSeconds into player metadata when playing a downloaded track', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-duration-metadata',
      name: 'Duration Metadata Track',
      sourceUrlNormalized: 'https://example.com/duration-metadata.mp3',
      durationSeconds: 1800,
    })

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('play-track')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('play-track'))

    await waitFor(() => {
      expect(setAudioUrlMock).toHaveBeenCalledWith(
        'blob:audio',
        'Duration Metadata Track',
        null,
        expect.objectContaining({
          durationSeconds: 1800,
        }),
        false
      )
    })
  })

  it('does not apply session/seek side effects when stream-only start is stale', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-stale',
      name: 'Stale Stream Track',
      sourceUrlNormalized: 'https://example.com/stale.mp3',
    })
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)
    vi.mocked(DownloadsRepository.getRestoreSessionByTrackId).mockResolvedValue({
      id: 'local-track-track-stale',
      progress: 88,
      durationSeconds: 300,
    } as PlaybackSession)
    playStreamWithoutTranscriptWithDepsMock.mockResolvedValue({ started: false, reason: 'stale' })

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('playWithoutTranscript')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('playWithoutTranscript'))

    await waitFor(() => {
      expect(playStreamWithoutTranscriptWithDepsMock).toHaveBeenCalledTimes(1)
    })
    expect(setSessionIdMock).not.toHaveBeenCalled()
    expect(queueAutoplayAfterPendingSeekMock).not.toHaveBeenCalled()
    expect(seekToMock).not.toHaveBeenCalled()
  })

  it('handles non-start no_playable_source reason deterministically without session side effects', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-no-source',
      name: 'No Source Stream Track',
      sourceUrlNormalized: 'https://example.com/nosource.mp3',
    })
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)
    vi.mocked(DownloadsRepository.getRestoreSessionByTrackId).mockResolvedValue({
      id: 'local-track-track-no-source',
      progress: 42,
      durationSeconds: 300,
    } as PlaybackSession)
    playStreamWithoutTranscriptWithDepsMock.mockResolvedValue({
      started: false,
      reason: 'no_playable_source',
    })

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('playWithoutTranscript')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('playWithoutTranscript'))

    await waitFor(() => {
      expect(playStreamWithoutTranscriptWithDepsMock).toHaveBeenCalledTimes(1)
    })
    expect(setSessionIdMock).not.toHaveBeenCalled()
    expect(queueAutoplayAfterPendingSeekMock).not.toHaveBeenCalled()
    expect(seekToMock).not.toHaveBeenCalled()
  })

  it('applies the same zero-side-effect guard for any non-start reason', async () => {
    const mockTrack = makeDownloadedTrack({
      id: 'track-non-start-guard',
      name: 'Non Start Guard Track',
      sourceUrlNormalized: 'https://example.com/non-start-guard.mp3',
    })
    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)
    vi.mocked(DownloadsRepository.getRestoreSessionByTrackId).mockResolvedValue({
      id: 'local-track-non-start-guard',
      progress: 53,
      durationSeconds: 300,
    } as PlaybackSession)
    playStreamWithoutTranscriptWithDepsMock.mockResolvedValue({
      started: false,
      reason: 'download_failed',
    })

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('playWithoutTranscript')).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText('playWithoutTranscript'))

    await waitFor(() => {
      expect(playStreamWithoutTranscriptWithDepsMock).toHaveBeenCalledTimes(1)
    })
    expect(setSessionIdMock).not.toHaveBeenCalled()
    expect(queueAutoplayAfterPendingSeekMock).not.toHaveBeenCalled()
    expect(seekToMock).not.toHaveBeenCalled()
  })

  it('uses stream-only gate from source resolvability (invalid hides, valid shows)', async () => {
    type DownloadedTrack = Awaited<ReturnType<typeof getAllDownloadedTracks>>[number]
    const baseTrack: DownloadedTrack = {
      id: 'track-gate',
      name: 'Gate Track',
    } as DownloadedTrack

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([
      { ...baseTrack, sourceUrlNormalized: 'notaurl' },
    ])
    const { unmount } = render(<DownloadsPage />)
    await waitFor(() => {
      expect(screen.queryByLabelText('playWithoutTranscript')).toBeNull()
    })
    expect(vi.mocked(canPlayRemoteStreamWithoutTranscript)).toHaveBeenCalledWith(
      {
        sourceUrlNormalized: 'notaurl',
      },
      true
    )
    unmount()

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([
      {
        ...baseTrack,
        id: 'track-gate-valid',
        sourceUrlNormalized: 'https://example.com/ok.mp3',
      },
    ])
    render(<DownloadsPage />)
    await waitFor(() => {
      expect(screen.getByLabelText('playWithoutTranscript')).toBeDefined()
    })
    expect(vi.mocked(canPlayRemoteStreamWithoutTranscript)).toHaveBeenCalledWith(
      {
        sourceUrlNormalized: 'https://example.com/ok.mp3',
      },
      true
    )
  })

  it('shows play-without-transcript action when offline if local audio is available', async () => {
    type DownloadedTrack = Awaited<ReturnType<typeof getAllDownloadedTracks>>[number]
    const baseTrack: DownloadedTrack = {
      id: 'track-gate-offline',
      name: 'Gate Offline Track',
    } as DownloadedTrack
    isOnlineMock = false

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([
      {
        ...baseTrack,
        audioId: 'local-audio-id',
        sourceUrlNormalized: 'https://example.com/offline.mp3',
      },
    ])

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('playWithoutTranscript')).toBeDefined()
    })
    expect(vi.mocked(canPlayRemoteStreamWithoutTranscript)).toHaveBeenCalledWith(
      {
        sourceUrlNormalized: 'https://example.com/offline.mp3',
      },
      false
    )
  })

  it('hides play-without-transcript action when offline and no local/remote source is playable', async () => {
    type DownloadedTrack = Awaited<ReturnType<typeof getAllDownloadedTracks>>[number]
    const baseTrack: DownloadedTrack = {
      id: 'track-gate-offline-no-source',
      name: 'Gate Offline No Source Track',
    } as DownloadedTrack
    isOnlineMock = false

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([
      {
        ...baseTrack,
        sourceUrlNormalized: 'notaurl',
      },
    ])

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('playWithoutTranscript')).toBeNull()
    })
    expect(vi.mocked(canPlayRemoteStreamWithoutTranscript)).toHaveBeenCalledWith(
      {
        sourceUrlNormalized: 'notaurl',
      },
      false
    )
  })

  it('does not fallback to global country for episode route when countryAtSave is missing', async () => {
    const mockTrack: PodcastDownload = {
      id: 'track-route-country-missing',
      name: 'Route Country Missing',
      audioId: 'audio-route-country-missing',
      sizeBytes: 4096,
      createdAt: 4,
      sourceType: 'podcast_download',
      sourceUrlNormalized: 'https://example.com/route-country-missing.mp3',
      sourcePodcastItunesId: '12345',
      sourceEpisodeGuid: 'episode-abc',
      sourceEpisodeTitle: 'Episode Country Missing',
      lastAccessedAt: 4,
      downloadedAt: 4,
      countryAtSave: '', // simulate missing even though type requires it
    }

    vi.mocked(getAllDownloadedTracks).mockResolvedValue([mockTrack])
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([])
    vi.mocked(selectPlaybackSubtitle).mockReturnValue(undefined)

    render(<DownloadsPage />)

    await waitFor(() => {
      expect(downloadTrackCardPropsSpy).toHaveBeenCalled()
    })

    const lastCallArgs =
      downloadTrackCardPropsSpy.mock.calls[downloadTrackCardPropsSpy.mock.calls.length - 1]
    expect(lastCallArgs?.[0]?.episodeRoute).toBeNull()
  })
})
