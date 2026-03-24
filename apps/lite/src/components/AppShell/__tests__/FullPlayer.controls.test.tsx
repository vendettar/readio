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

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg />,
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

    expect(screen.getByText('asrDownloading')).toBeTruthy()
    expect(screen.queryByTestId('transcript')).toBeNull()
  })

  it('shows ASR transcribing hint when ASR is running', () => {
    act(() => {
      useTranscriptStore.setState({
        subtitlesLoaded: false,
        subtitles: [],
        transcriptIngestionStatus: 'transcribing',
      })
    })

    render(<PlayerSurfaceFrame mode="full" />)

    expect(screen.getByText('asrTranscribing')).toBeTruthy()
    expect(screen.queryByTestId('transcript')).toBeNull()
  })

  it('minimize button triggers toDocked if restore available', () => {
    act(() => {
      usePlayerSurfaceStore.getState().setPlayableContext(true)
    })

    const toDockedSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toDocked')
    const toMiniSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toMini')

    render(<PlayerSurfaceFrame mode="full" />)
    const minimizeBtn = screen.getByLabelText('ariaMinimize')
    fireEvent.click(minimizeBtn)

    expect(toDockedSpy).toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()
  })

  it('has player-surface-frame data-testid', () => {
    render(<PlayerSurfaceFrame mode="full" />)
    expect(screen.getByTestId('player-surface-frame')).toBeTruthy()
  })

  it('uses shared smart skip commands on footer controls', () => {
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

    render(<PlayerSurfaceFrame mode="full" />)

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

  it('cycles playback rate via shared controller and normalizes unknown values', () => {
    act(() => {
      usePlayerStore.setState({ playbackRate: 1, audioLoaded: true })
    })
    render(<PlayerSurfaceFrame mode="full" />)

    fireEvent.click(screen.getByLabelText('ariaPlaybackSpeed'))
    expect(usePlayerStore.getState().playbackRate).toBe(1.25)

    act(() => {
      usePlayerStore.setState({ playbackRate: 3.7 })
    })
    fireEvent.click(screen.getByLabelText('ariaPlaybackSpeed'))
    expect(usePlayerStore.getState().playbackRate).toBe(1)
  })

  it('exposes aria label for full player seek slider', () => {
    render(<PlayerSurfaceFrame mode="full" />)
    expect(screen.getByLabelText('ariaPlaybackProgress')).toBeTruthy()
  })
})
