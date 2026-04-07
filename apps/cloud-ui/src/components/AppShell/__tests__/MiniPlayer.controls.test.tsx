import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackExportContext } from '../../../lib/player/playbackExport'
import {
  exportCurrentAudioForPlayback,
  exportCurrentTranscriptAndAudioBundle,
  exportCurrentTranscriptForPlayback,
  importTranscriptForCurrentPlayback,
  resolveCurrentPlaybackExportContext,
} from '../../../lib/player/playbackExport'
import { usePlayerStore } from '../../../store/playerStore'
import { usePlayerSurfaceStore } from '../../../store/playerSurfaceStore'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { MiniPlayer } from '../MiniPlayer'

// Mocks
vi.mock('../../ReadingBgControl', () => ({
  ReadingBgControl: () => <div />,
}))

vi.mock('../../../hooks/useImageObjectUrl', () => ({
  useImageObjectUrl: () => null,
}))

vi.mock('../../ui/overflow-menu', () => ({
  OverflowMenu: ({
    children,
    triggerAriaLabel,
    disabled,
    open,
    onOpenChange,
  }: {
    children?: ReactNode
    triggerAriaLabel: string
    disabled?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) => (
    <div>
      <button
        type="button"
        aria-label={triggerAriaLabel}
        disabled={disabled}
        onClick={() => onOpenChange?.(!open)}
      />
      {open ? <div role="menu">{children}</div> : null}
    </div>
  ),
}))

vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    ...props
  }: {
    children?: ReactNode
    onSelect?: (event: { preventDefault: () => void }) => void
    disabled?: boolean
    [key: string]: unknown
  }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onSelect?.({ preventDefault: () => {} })}
      {...props}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: (props: Record<string, unknown>) => <div {...props} />,
}))

vi.mock('lucide-react', () => {
  return {
    ChevronDown: () => <svg />,
    ChevronUp: () => <svg />,
    FilePlus: () => <svg />,
    Info: () => <svg />,
    ListMusic: () => <svg />,
    Loader2: () => <svg />,
    MoreVertical: () => <svg />,
    Pause: () => <svg />,
    Play: () => <svg />,
    Podcast: () => <svg />,
    RotateCcw: () => <svg />,
    SkipBack: () => <svg />,
    SkipForward: () => <svg />,
    Volume: () => <svg />,
    Volume1: () => <svg />,
    Volume2: () => <svg />,
    VolumeX: () => <svg />,
  }
})

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}))

vi.mock('../../../lib/imageUtils', () => ({
  getDiscoveryArtworkUrl: (url: string) => url,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('../../../lib/player/playbackExport', () => ({
  resolveCurrentPlaybackExportContext: vi.fn(),
  importTranscriptForCurrentPlayback: vi.fn(),
  exportCurrentTranscriptForPlayback: vi.fn(),
  exportCurrentAudioForPlayback: vi.fn(),
  exportCurrentTranscriptAndAudioBundle: vi.fn(),
}))

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function openMoreMenu() {
  fireEvent.click(screen.getByLabelText('miniPlayerMore'))
}

async function renderMiniPlayerAndWaitForMenuController() {
  const rendered = render(<MiniPlayer />)
  await waitFor(() => {
    expect(resolveCurrentPlaybackExportContext).toHaveBeenCalled()
  })
  return rendered
}

function makePlaybackExportContext(
  overrides: Partial<PlaybackExportContext> = {}
): PlaybackExportContext {
  return {
    identity: {
      localTrackId: 'track-1',
      audioUrl: 'blob:test-track',
      originalAudioUrl: 'blob:test-track',
      normalizedAudioUrl: 'blob:test-track',
      audioTitle: 'Test Track',
      episodeMetadata: null,
      playbackIdentityKey: 'local-track:track-1',
    },
    track: null,
    trackKind: 'user-upload' as const,
    transcriptUrl: null,
    hasLoadedTranscript: true,
    hasStoredTranscriptSource: true,
    hasBuiltInTranscriptSource: false,
    canExportTranscript: true,
    canExportAudio: true,
    canExportBundle: true,
    ...overrides,
  }
}

describe('MiniPlayer Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePlayerSurfaceStore.getState().reset()
    useTranscriptStore.getState().resetTranscript()
    usePlayerStore.setState({
      audioLoaded: true,
      audioTitle: 'Test Track',
      audioUrl: 'blob:test-track',
      localTrackId: 'track-1',
      episodeMetadata: {
        originalAudioUrl: 'blob:test-track',
      },
      loadRequestId: 1,
    })
    vi.mocked(resolveCurrentPlaybackExportContext).mockResolvedValue(makePlaybackExportContext())
    vi.mocked(importTranscriptForCurrentPlayback).mockResolvedValue({
      ok: true,
      reason: 'imported',
    })
    vi.mocked(exportCurrentTranscriptForPlayback).mockResolvedValue({
      ok: true,
      reason: 'exported',
    })
    vi.mocked(exportCurrentAudioForPlayback).mockResolvedValue({
      ok: true,
      reason: 'exported',
    })
    vi.mocked(exportCurrentTranscriptAndAudioBundle).mockResolvedValue({
      ok: true,
      reason: 'exported',
    })
  })

  it('renders restore button (artwork) when canDockedRestore is true', async () => {
    usePlayerSurfaceStore.getState().setPlayableContext(true)
    // By default canDockedRestore is true if implemented correctly or set explicitly
    // If not, we set it explicitly
    // Logic: setPlayableContext(true) sets canDockedRestore=true

    await renderMiniPlayerAndWaitForMenuController()
    const expandBtn = screen.getByLabelText('ariaExpandPlayer')
    expect(expandBtn).toBeTruthy()
    expect(expandBtn.hasAttribute('disabled')).toBe(false)
  })

  it('artwork click toggles docked state when restore available', async () => {
    usePlayerSurfaceStore.getState().setPlayableContext(true)
    const toDockedSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toDocked')
    const toMiniSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toMini')

    const { rerender } = await renderMiniPlayerAndWaitForMenuController()
    const expandBtn = screen.getByLabelText('ariaExpandPlayer')

    // 1. Initial click -> toDocked
    fireEvent.click(expandBtn)
    expect(toDockedSpy).toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()

    // 2. Click while mode is docked -> toMini
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    rerender(<MiniPlayer />)
    fireEvent.click(expandBtn)
    expect(toMiniSpy).toHaveBeenCalled()
  })

  it('uses shared smart prev/next command semantics', async () => {
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

    await renderMiniPlayerAndWaitForMenuController()

    fireEvent.click(screen.getByLabelText('btnPrev'))
    expect(usePlayerStore.getState().pendingSeek).toBe(10)

    usePlayerStore.setState({ pendingSeek: null })
    useTranscriptStore.setState({ currentIndex: 1 })
    fireEvent.click(screen.getByLabelText('btnNext'))
    expect(usePlayerStore.getState().pendingSeek).toBe(50)
  })

  it('cycles playback rate from mini player speed button and reflects live value', async () => {
    usePlayerStore.setState({
      playbackRate: 1,
    })

    await renderMiniPlayerAndWaitForMenuController()

    const speedButton = screen.getByLabelText('ariaPlaybackSpeed')
    expect(speedButton.textContent).toBe('1x')

    fireEvent.click(speedButton)
    expect(usePlayerStore.getState().playbackRate).toBe(1.25)
    expect(screen.getByLabelText('ariaPlaybackSpeed').textContent).toBe('1.25x')
  })

  it('exposes aria labels for progress and volume sliders', async () => {
    await renderMiniPlayerAndWaitForMenuController()

    expect(screen.getByLabelText('ariaPlaybackProgress')).toBeTruthy()
    expect(screen.getByLabelText('ariaVolumeSlider')).toBeTruthy()
  })

  it('keeps volume controls enabled when no track is loaded', () => {
    usePlayerStore.setState({
      audioLoaded: false,
      audioTitle: undefined,
      audioUrl: undefined,
      localTrackId: null,
      episodeMetadata: null,
      volume: 0.8,
    })

    render(<MiniPlayer />)

    expect(screen.getByText('noTrackLoaded').closest('div.fixed')?.className).not.toContain(
      'opacity-50'
    )

    const volumeButton = screen.getByLabelText('ariaMute')
    const volumeSlider = screen.getAllByRole('slider')[1]
    const playButton = screen.getByLabelText('ariaPlay')

    expect(volumeButton.hasAttribute('disabled')).toBe(false)
    expect(volumeSlider.getAttribute('aria-disabled')).not.toBe('true')
    expect(playButton.hasAttribute('disabled')).toBe(true)

    fireEvent.click(volumeButton)
    expect(usePlayerStore.getState().volume).toBe(0)

    fireEvent.click(screen.getByLabelText('ariaUnmute'))
    expect(usePlayerStore.getState().volume).toBe(0.8)

    volumeSlider.focus()
    fireEvent.keyDown(volumeSlider, { key: 'ArrowLeft' })
    expect(usePlayerStore.getState().volume).toBe(0.79)
  })

  it('renders more menu trigger in the existing mini player layout and opens export submenu', async () => {
    await renderMiniPlayerAndWaitForMenuController()

    expect(screen.getByText('Test Track').closest('div.fixed')?.className).toContain(
      'h-mini-player'
    )
    expect(screen.getByText('Test Track').closest('div.fixed')?.className).toContain(
      'z-mini-player'
    )

    openMoreMenu()

    expect(await screen.findByRole('menuitem', { name: 'importTranscript' })).toBeTruthy()
    expect(screen.getByTestId('mini-player-export-options')).toBeTruthy()

    fireEvent.click(screen.getByTestId('mini-player-export-options'))

    expect(await screen.findByRole('menuitem', { name: 'exportTranscript' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'exportAudio' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'exportAll' })).toBeTruthy()
  })

  it('disables the more menu trigger when the controller marks it unavailable', () => {
    usePlayerStore.setState({
      audioLoaded: false,
      audioTitle: '',
      audioUrl: null,
      localTrackId: null,
      episodeMetadata: null,
    })

    render(<MiniPlayer />)

    expect(screen.getByLabelText('miniPlayerMore').hasAttribute('disabled')).toBe(true)
  })

  it('closes the menu before invoking transcript import and routes the file through playback export', async () => {
    const filePickerClick = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined)

    await renderMiniPlayerAndWaitForMenuController()

    openMoreMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'importTranscript' }))

    await waitFor(() => {
      expect(filePickerClick).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'importTranscript' })).toBeNull()
    })

    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Expected transcript import input')
    }

    const file = new File(['1\n00:00:00,000 --> 00:00:01,000\nHello'], 'imported.srt', {
      type: 'text/plain',
    })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(importTranscriptForCurrentPlayback).toHaveBeenCalledWith(file)
    })

    filePickerClick.mockRestore()
  })

  it('does not invoke disabled export actions', async () => {
    vi.mocked(resolveCurrentPlaybackExportContext).mockResolvedValue(
      makePlaybackExportContext({ canExportTranscript: false, canExportBundle: false })
    )

    render(<MiniPlayer />)

    openMoreMenu()
    fireEvent.click(await screen.findByTestId('mini-player-export-options'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'exportTranscript' }))

    expect(exportCurrentTranscriptForPlayback).not.toHaveBeenCalled()
  })

  it('routes enabled export actions through playback export helpers', async () => {
    render(<MiniPlayer />)

    openMoreMenu()
    fireEvent.click(await screen.findByTestId('mini-player-export-options'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'exportTranscript' }))

    await waitFor(() => {
      expect(exportCurrentTranscriptForPlayback).toHaveBeenCalledTimes(1)
    })
  })
})
