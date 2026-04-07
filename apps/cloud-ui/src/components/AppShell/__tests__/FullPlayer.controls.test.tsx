import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  useMediaQuery: () => true,
}))

vi.mock('../../hooks/useImageObjectUrl', () => ({
  useImageObjectUrl: () => null,
}))

const isAsrReadyForGenerationMock = vi.fn().mockResolvedValue(true)

vi.mock('../../../lib/asr/readiness', () => ({
  getAsrReadinessUpdatedEventName: () => 'readio:asr-readiness-updated',
  isAsrReadyForGeneration: (...args: unknown[]) => isAsrReadyForGenerationMock(...args),
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

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg />,
  Download: () => <svg />,
  Eye: () => <svg />,
  Loader2: () => <svg />,
  Maximize2: () => <svg />,
  Minimize2: () => <svg />,
  Pause: () => <svg />,
  Play: () => <svg />,
  RefreshCcw: () => <svg />,
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

vi.mock('../Transcript', () => ({
  TranscriptView: () => <div data-testid="transcript" />,
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

vi.mock('../../ZoomControl', () => ({
  ZoomControl: () => <div />,
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

describe('FullPlayer Controls (via PlayerSurfaceFrame)', () => {
  beforeEach(() => {
    localStorage.clear()
    isAsrReadyForGenerationMock.mockResolvedValue(true)
    act(() => {
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

  it('shows transcript loading hint when remote transcript is being ingested', () => {
    act(() => {
      usePlayerStore.setState({
        episodeMetadata: { transcriptUrl: 'https://example.com/t.srt' },
      })
      useTranscriptStore.setState({
        subtitlesLoaded: false,
        subtitles: [],
        transcriptIngestionStatus: 'loading',
      })
    })

    render(<PlayerSurfaceFrame mode="full" />)

    expect(screen.getByText('loadingTranscript')).toBeTruthy()
    expect(screen.queryByTestId('transcript')).toBeNull()
    expect(screen.queryByTestId('no-transcript-artwork')).toBeNull()
    expect(screen.queryByRole('button', { name: 'asrSetupTranscriptGeneration' })).toBeNull()
  })

  it('falls back to retry CTA after transcript loading exceeds the timeout', async () => {
    vi.useFakeTimers()
    try {
      act(() => {
        usePlayerStore.setState({
          audioLoaded: true,
          audioTitle: 'Transcript Episode',
          audioUrl: 'https://example.com/audio.mp3',
          loadRequestId: 1,
          episodeMetadata: {
            transcriptUrl: 'https://example.com/transcript.vtt',
          },
        })
        useTranscriptStore.setState({
          subtitlesLoaded: false,
          subtitles: [],
          transcriptIngestionStatus: 'loading',
        })
      })

      await act(async () => {
        render(<PlayerSurfaceFrame mode="full" />)
        await Promise.resolve()
      })

      expect(screen.getByText('loadingTranscript')).toBeTruthy()

      await act(async () => {
        vi.advanceTimersByTime(15000)
        await Promise.resolve()
      })

      expect(screen.queryByText('loadingTranscript')).toBeNull()
      expect(screen.getByRole('button', { name: 'retryTranscript' })).toBeTruthy()
      expect(screen.getByText('transcriptAvailable')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets the transcript loading timeout when the active track changes', async () => {
    vi.useFakeTimers()
    try {
      act(() => {
        usePlayerStore.setState({
          audioLoaded: true,
          audioTitle: 'Track A',
          audioUrl: 'https://example.com/a.mp3',
          loadRequestId: 1,
          episodeMetadata: {
            transcriptUrl: 'https://example.com/a.vtt',
          },
        })
        useTranscriptStore.setState({
          subtitlesLoaded: false,
          subtitles: [],
          transcriptIngestionStatus: 'loading',
        })
      })

      await act(async () => {
        render(<PlayerSurfaceFrame mode="full" />)
        await Promise.resolve()
      })

      await act(async () => {
        vi.advanceTimersByTime(10000)
        await Promise.resolve()
      })

      await act(async () => {
        usePlayerStore.setState({
          audioTitle: 'Track B',
          audioUrl: 'https://example.com/b.mp3',
          loadRequestId: 2,
          episodeMetadata: {
            transcriptUrl: 'https://example.com/b.vtt',
          },
        })
        await Promise.resolve()
      })

      await act(async () => {
        vi.advanceTimersByTime(5000)
        await Promise.resolve()
      })

      expect(screen.getByText('loadingTranscript')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'retryTranscript' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows ASR transcribing hint when ASR is running', async () => {
    act(() => {
      useTranscriptStore.setState({
        subtitlesLoaded: false,
        subtitles: [],
        transcriptIngestionStatus: 'transcribing',
      })
    })

    await act(async () => {
      render(<PlayerSurfaceFrame mode="full" />)
      await Promise.resolve()
    })

    expect(screen.getByText('asrTranscribing')).toBeTruthy()
    expect(screen.queryByTestId('transcript')).toBeNull()
  })

  it('does not show setup subtitle generation CTA for transcript-bearing episodes without loaded cues', async () => {
    isAsrReadyForGenerationMock.mockResolvedValue(false)
    act(() => {
      usePlayerStore.setState({
        audioLoaded: true,
        audioTitle: 'Transcript Episode',
        audioUrl: 'https://example.com/audio.mp3',
        episodeMetadata: { transcriptUrl: 'https://example.com/transcript.vtt' },
      })
      useTranscriptStore.setState({
        subtitlesLoaded: false,
        subtitles: [],
        transcriptIngestionStatus: 'idle',
        partialAsrCues: null,
      })
    })

    render(<PlayerSurfaceFrame mode="full" />)

    expect(await screen.findByTestId('no-transcript-artwork')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'asrSetupTranscriptGeneration' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'asrGenerateTranscript' })).toBeNull()
  })

  it('minimize button triggers toDocked if restore available', async () => {
    act(() => {
      usePlayerSurfaceStore.getState().setPlayableContext(true)
    })

    const toDockedSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toDocked')
    const toMiniSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toMini')

    await act(async () => {
      render(<PlayerSurfaceFrame mode="full" />)
      await Promise.resolve()
    })
    const minimizeBtn = screen.getByLabelText('ariaMinimize')
    fireEvent.click(minimizeBtn)

    expect(toDockedSpy).toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()
  })

  it('has player-surface-frame data-testid', async () => {
    await act(async () => {
      render(<PlayerSurfaceFrame mode="full" />)
      await Promise.resolve()
    })
    expect(screen.getByTestId('player-surface-frame')).toBeTruthy()
  })

  it('uses shared smart skip commands on footer controls', async () => {
    act(() => {
      useTranscriptStore.setState({
        subtitles: [
          { start: 10, end: 20, text: 'a' },
          { start: 30, end: 40, text: 'b' },
          { start: 50, end: 60, text: 'c' },
        ],
        currentIndex: 1,
      })
      usePlayerStore.setState({
        progress: 30,
        duration: 120,
        pendingSeek: null,
      })
    })

    await act(async () => {
      render(<PlayerSurfaceFrame mode="full" />)
      await Promise.resolve()
    })

    fireEvent.click(screen.getByLabelText('skipBack10s'))
    expect(usePlayerStore.getState().pendingSeek).toBe(10)

    act(() => {
      usePlayerStore.setState({
        pendingSeek: null,
      })
      useTranscriptStore.setState({
        currentIndex: 0,
        subtitles: [
          { start: 10, end: 20, text: 'a' },
          { start: 30, end: 40, text: 'b' },
          { start: 50, end: 60, text: 'c' },
        ],
      })
    })
    fireEvent.click(screen.getByLabelText('skipForward10s'))
    expect(usePlayerStore.getState().pendingSeek).toBe(30)
  })

  it('cycles playback rate via shared controller and normalizes unknown values', async () => {
    act(() => {
      usePlayerStore.setState({ playbackRate: 1, audioLoaded: true })
    })
    await act(async () => {
      render(<PlayerSurfaceFrame mode="full" />)
      await Promise.resolve()
    })

    fireEvent.click(screen.getByLabelText('ariaPlaybackSpeed'))
    expect(usePlayerStore.getState().playbackRate).toBe(1.25)

    act(() => {
      usePlayerStore.setState({ playbackRate: 3.7 })
    })
    fireEvent.click(screen.getByLabelText('ariaPlaybackSpeed'))
    expect(usePlayerStore.getState().playbackRate).toBe(1)
  })

  it('exposes aria label for full player seek slider', async () => {
    await act(async () => {
      render(<PlayerSurfaceFrame mode="full" />)
      await Promise.resolve()
    })
    expect(screen.getByLabelText('ariaPlaybackProgress')).toBeTruthy()
  })
})
