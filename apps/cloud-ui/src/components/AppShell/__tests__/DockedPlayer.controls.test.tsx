import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAYBACK_REQUEST_MODE } from '../../../lib/player/playbackMode'
import {
  autoIngestEpisodeTranscript,
  hasStoredTranscriptSource,
  startOnlineASRForCurrentTrack,
  tryApplyCachedAsrTranscript,
} from '../../../lib/remoteTranscript'
import { usePlayerStore } from '../../../store/playerStore'
import { usePlayerSurfaceStore } from '../../../store/playerSurfaceStore'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { PlayerSurfaceFrame } from '../PlayerSurfaceFrame'

// Mocks
vi.mock('../../hooks/useZoom', () => ({
  useZoom: () => ({
    zoomScale: 1,
    showZoomBar: true,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomReset: vi.fn(),
    setShowZoomBar: vi.fn(),
    scheduleHide: vi.fn(),
  }),
}))

vi.mock('../../hooks/usePageVisibility', () => ({
  usePageVisibility: () => true,
}))

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('../../hooks/useImageObjectUrl', () => ({
  useImageObjectUrl: () => null,
}))

vi.mock('../../../lib/remoteTranscript', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/remoteTranscript')>()
  return {
    ...actual,
    autoIngestEpisodeTranscript: vi.fn(),
    hasStoredTranscriptSource: vi.fn().mockResolvedValue(false),
    startOnlineASRForCurrentTrack: vi.fn(),
    tryApplyCachedAsrTranscript: vi.fn().mockResolvedValue(false),
  }
})

const isAsrReadyForGenerationMock = vi.fn().mockResolvedValue(true)

vi.mock('../../../lib/asr/readiness', () => ({
  getAsrReadinessUpdatedEventName: () => 'readio:asr-readiness-updated',
  isAsrReadyForGeneration: (...args: unknown[]) => isAsrReadyForGenerationMock(...args),
}))

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg />,
  Eye: () => <svg />,
  Loader2: () => <svg />,
  Maximize2: () => <svg />,
  Minimize2: () => <svg />,
  Pause: () => <svg />,
  Play: () => <svg />,
  Settings2: () => <svg />,
  SkipBack: () => <svg />,
  SkipForward: () => <svg />,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      ...rest
    }: {
      children?: ReactNode
      className?: string
      [key: string]: unknown
    }) => (
      <div className={className} data-testid={rest['data-testid'] as string}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('../../Transcript', () => ({
  TranscriptView: () => <div data-testid="transcript" />,
}))

vi.mock('../../ZoomControl', () => ({
  ZoomControl: () => <div />,
}))

vi.mock('../../FollowButton', () => ({
  FollowButton: () => <button type="button">Follow</button>,
}))

vi.mock('../../Player/ShareButton', () => ({
  ShareButton: () => <button type="button">Share</button>,
}))

vi.mock('../../Player/SleepTimerButton', () => ({
  SleepTimerButton: () => <button type="button">Timer</button>,
}))

vi.mock('../../ReadingBgControl', () => ({
  ReadingBgControl: () => <div />,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

describe('DockedPlayer Controls (via PlayerSurfaceFrame)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(autoIngestEpisodeTranscript).mockReset()
    vi.mocked(hasStoredTranscriptSource).mockReset().mockResolvedValue(false)
    vi.mocked(startOnlineASRForCurrentTrack).mockReset()
    vi.mocked(tryApplyCachedAsrTranscript).mockReset().mockResolvedValue(false)
    isAsrReadyForGenerationMock.mockResolvedValue(true)
    act(() => {
      usePlayerStore.getState().reset()
      usePlayerSurfaceStore.getState().reset()
      usePlayerStore.setState({
        audioLoaded: true,
        audioTitle: 'Test Track',
      })
      useTranscriptStore.setState({
        subtitlesLoaded: true,
        subtitles: [{ start: 0, end: 1, text: 'test' }],
      })
    })
  })

  it('minimize button triggers toMini', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    const toMiniSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toMini')

    render(<PlayerSurfaceFrame mode="docked" />)
    const minimizeBtn = screen.getByLabelText('ariaMinimize')
    fireEvent.click(minimizeBtn)

    expect(toMiniSpy).toHaveBeenCalled()
  })

  it('does not render full mode toggle button in docked mode', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })

    render(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.queryByLabelText('ariaOpenQueue')).toBeNull()
  })

  it('hides full mode toggle button when transcript is unavailable', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      episodeMetadata: null,
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.queryByLabelText('ariaOpenQueue')).toBeNull()
    expect(screen.getByLabelText('ariaMinimize')).toBeTruthy()
  })

  it('keeps full mode toggle button hidden even when remote transcript source exists', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      episodeMetadata: { transcriptUrl: 'https://example.com/transcript.vtt' },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'loading',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.queryByLabelText('ariaOpenQueue')).toBeNull()
  })

  it('hides full mode toggle button in no-transcript state even with transcript source', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      episodeMetadata: { transcriptUrl: 'https://example.com/transcript.vtt' },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
      partialAsrCues: null,
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.queryByLabelText('ariaOpenQueue')).toBeNull()
  })

  it('hides full mode toggle button for local track in no-transcript state', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      localTrackId: 'local-track-1',
      episodeMetadata: null,
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.queryByLabelText('ariaOpenQueue')).toBeNull()
  })

  it('shows no transcript placeholder in docked mode when subtitles are absent', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      episodeMetadata: null,
      audioUrl: 'https://example.com/audio.mp3',
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.getByTestId('no-transcript-artwork')).toBeTruthy()
    expect(screen.getByText('noTranscript')).toBeTruthy()
    return waitFor(() => {
      expect(screen.getByRole('button', { name: 'asrGenerateTranscript' })).toBeTruthy()
    })
  })

  it('restarts ASR from docked no-transcript state', async () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      episodeMetadata: null,
      audioUrl: 'https://example.com/audio.mp3',
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    fireEvent.click(await screen.findByRole('button', { name: 'asrGenerateTranscript' }))
    expect(startOnlineASRForCurrentTrack).toHaveBeenCalledWith('manual')
  })

  it('shows settings CTA instead of generate subtitles when ASR is not ready', async () => {
    isAsrReadyForGenerationMock.mockResolvedValue(false)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      episodeMetadata: null,
      audioUrl: 'https://example.com/audio.mp3',
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'asrGenerateTranscript' })).toBeNull()
      expect(screen.getByRole('button', { name: 'asrSetupTranscriptGeneration' })).toBeTruthy()
    })
  })

  it('does not show setup CTA before async ASR readiness resolves', async () => {
    const readinessDeferred = createDeferred<boolean>()
    isAsrReadyForGenerationMock.mockImplementationOnce(() => readinessDeferred.promise)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      episodeMetadata: null,
      audioUrl: 'https://example.com/audio.mp3',
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.queryByRole('button', { name: 'asrSetupTranscriptGeneration' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'asrGenerateTranscript' })).toBeNull()

    readinessDeferred.resolve(false)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'asrSetupTranscriptGeneration' })).toBeTruthy()
    })
  })

  it('collapses docked surface then navigates to ASR settings from setup CTA', async () => {
    isAsrReadyForGenerationMock.mockResolvedValue(false)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      episodeMetadata: null,
      audioUrl: 'https://example.com/audio.mp3',
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    const toMiniSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toMini')
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<PlayerSurfaceFrame mode="docked" />)

    const setupButton = await screen.findByRole('button', {
      name: 'asrSetupTranscriptGeneration',
    })
    fireEvent.click(setupButton)

    expect(toMiniSpy).toHaveBeenCalled()
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'readio:navigate',
      })
    )

    toMiniSpy.mockRestore()
    dispatchSpy.mockRestore()
  })

  it('shows transcript CTA in docked pure listening mode when transcript source exists', async () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      audioTitle: 'Stream Track',
      audioUrl: 'https://example.com/stream.mp3',
      coverArtUrl: 'https://example.com/artwork.jpg',
      episodeMetadata: {
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
        transcriptUrl: 'https://example.com/transcript.vtt',
      },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    await act(async () => {
      render(<PlayerSurfaceFrame mode="docked" />)
      await Promise.resolve()
    })

    expect(screen.getByTestId('no-transcript-artwork')).toBeTruthy()
    expect(screen.getByText('transcriptAvailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'showTranscript' })).toBeTruthy()
  })

  it('uses transcript load path instead of manual ASR for docked show transcript CTA', async () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      audioTitle: 'Stream Track',
      audioUrl: 'https://example.com/stream.mp3',
      episodeMetadata: {
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
        transcriptUrl: 'https://example.com/transcript.vtt',
      },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    fireEvent.click(screen.getByRole('button', { name: 'showTranscript' }))

    await waitFor(() => {
      expect(autoIngestEpisodeTranscript).toHaveBeenCalledWith(
        'https://example.com/transcript.vtt',
        'https://example.com/stream.mp3'
      )
      expect(tryApplyCachedAsrTranscript).toHaveBeenCalledWith(
        'https://example.com/stream.mp3',
        null,
        expect.any(Number)
      )
      expect(startOnlineASRForCurrentTrack).not.toHaveBeenCalled()
    })
  })

  it('shows transcript CTA for stored local transcript source before cues are loaded', async () => {
    vi.mocked(hasStoredTranscriptSource).mockResolvedValueOnce(true)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      audioTitle: 'Local Track',
      audioUrl: 'blob:local-track',
      localTrackId: 'local-track-1',
      episodeMetadata: {
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    await waitFor(() => {
      expect(screen.getByText('transcriptAvailable')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'showTranscript' })).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'asrGenerateTranscript' })).toBeNull()
  })

  it('suppresses generate and setup CTA while stored transcript lookup is still pending', async () => {
    const deferredStoredTranscriptLookup = createDeferred<boolean>()
    vi.mocked(hasStoredTranscriptSource).mockReturnValueOnce(deferredStoredTranscriptLookup.promise)
    isAsrReadyForGenerationMock.mockResolvedValue(false)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      audioTitle: 'Local Track',
      audioUrl: 'blob:local-track',
      localTrackId: 'local-track-1',
      episodeMetadata: {
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    await waitFor(() => {
      expect(isAsrReadyForGenerationMock).toHaveBeenCalled()
    })

    expect(screen.queryByRole('button', { name: 'asrSetupTranscriptGeneration' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'asrGenerateTranscript' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'showTranscript' })).toBeNull()

    act(() => {
      deferredStoredTranscriptLookup.resolve(true)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'showTranscript' })).toBeTruthy()
    })
  })

  it('falls back to setup CTA when stored transcript lookup fails', async () => {
    vi.mocked(hasStoredTranscriptSource).mockRejectedValueOnce(new Error('lookup failed'))
    isAsrReadyForGenerationMock.mockResolvedValue(false)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      audioTitle: 'Local Track',
      audioUrl: 'blob:local-track',
      localTrackId: 'local-track-1',
      episodeMetadata: {
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'asrSetupTranscriptGeneration' })).toBeTruthy()
    })

    expect(screen.queryByRole('button', { name: 'showTranscript' })).toBeNull()
  })

  it('does not trigger ASR when show transcript resolves a stored local transcript', async () => {
    vi.mocked(hasStoredTranscriptSource).mockResolvedValueOnce(true)
    vi.mocked(tryApplyCachedAsrTranscript).mockResolvedValueOnce(true)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      audioTitle: 'Local Track',
      audioUrl: 'blob:local-track',
      localTrackId: 'local-track-1',
      episodeMetadata: {
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    fireEvent.click(await screen.findByRole('button', { name: 'showTranscript' }))

    expect(tryApplyCachedAsrTranscript).toHaveBeenCalledWith(
      'blob:local-track',
      'local-track-1',
      expect.any(Number)
    )
    expect(autoIngestEpisodeTranscript).not.toHaveBeenCalled()
    expect(startOnlineASRForCurrentTrack).not.toHaveBeenCalled()
  })

  it('retries transcript loading instead of ASR when transcript source load previously failed', async () => {
    vi.mocked(hasStoredTranscriptSource).mockResolvedValueOnce(false)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      audioTitle: 'Stream Track',
      audioUrl: 'https://example.com/stream.mp3',
      episodeMetadata: {
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
        transcriptUrl: 'https://example.com/transcript.vtt',
      },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'failed',
      transcriptIngestionError: {
        code: 'transcript_fetch_failed',
        message: 'Transcript available but could not be loaded',
      },
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    fireEvent.click(await screen.findByRole('button', { name: 'retryTranscript' }))

    await waitFor(() => {
      expect(autoIngestEpisodeTranscript).toHaveBeenCalledWith(
        'https://example.com/transcript.vtt',
        'https://example.com/stream.mp3'
      )
    })
    expect(startOnlineASRForCurrentTrack).not.toHaveBeenCalled()
  })

  it('does not treat malformed transcriptUrl as an available transcript source', async () => {
    vi.mocked(hasStoredTranscriptSource).mockResolvedValueOnce(false)
    isAsrReadyForGenerationMock.mockResolvedValue(false)
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    usePlayerStore.setState({
      audioTitle: 'Broken Transcript Metadata',
      audioUrl: 'https://example.com/stream.mp3',
      episodeMetadata: {
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
        transcriptUrl: '  foo  ',
      },
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
      transcriptIngestionStatus: 'idle',
      subtitles: [],
    })

    render(<PlayerSurfaceFrame mode="docked" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'asrSetupTranscriptGeneration' })).toBeTruthy()
    })

    expect(screen.queryByRole('button', { name: 'showTranscript' })).toBeNull()
    expect(screen.queryByText('transcriptAvailable')).toBeNull()
  })

  it('has player-surface-frame data-testid', async () => {
    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'docked' })
    })

    await act(async () => {
      render(<PlayerSurfaceFrame mode="docked" />)
      await Promise.resolve()
    })

    expect(screen.getByTestId('player-surface-frame')).toBeTruthy()
  })
})
