import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('lucide-react', () => {
  return {
    ChevronDown: () => <svg />,
    ChevronUp: () => <svg />,
    Info: () => <svg />,
    ListMusic: () => <svg />,
    Loader2: () => <svg />,
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

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('MiniPlayer Controls', () => {
  beforeEach(() => {
    usePlayerSurfaceStore.getState().reset()
    usePlayerStore.setState({ audioLoaded: true, audioTitle: 'Test Track' })
    // Mocks for components rendered inside popovers are handled by simple divs above
  })

  it('renders restore button (artwork) when canDockedRestore is true', () => {
    usePlayerSurfaceStore.getState().setPlayableContext(true)
    // By default canDockedRestore is true if implemented correctly or set explicitly
    // If not, we set it explicitly
    // Logic: setPlayableContext(true) sets canDockedRestore=true

    render(<MiniPlayer />)
    const expandBtn = screen.getByLabelText('ariaExpandPlayer')
    expect(expandBtn).toBeTruthy()
    expect(expandBtn.hasAttribute('disabled')).toBe(false)
  })

  it('artwork click toggles docked state when restore available', () => {
    usePlayerSurfaceStore.getState().setPlayableContext(true)
    const toDockedSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toDocked')
    const toMiniSpy = vi.spyOn(usePlayerSurfaceStore.getState(), 'toMini')

    const { rerender } = render(<MiniPlayer />)
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

  it('uses shared smart prev/next command semantics', () => {
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

    render(<MiniPlayer />)

    fireEvent.click(screen.getByLabelText('btnPrev'))
    expect(usePlayerStore.getState().pendingSeek).toBe(10)

    usePlayerStore.setState({ pendingSeek: null })
    useTranscriptStore.setState({ currentIndex: 1 })
    fireEvent.click(screen.getByLabelText('btnNext'))
    expect(usePlayerStore.getState().pendingSeek).toBe(50)
  })

  it('cycles playback rate from mini player speed button and reflects live value', () => {
    usePlayerStore.setState({
      playbackRate: 1,
    })

    render(<MiniPlayer />)

    const speedButton = screen.getByLabelText('ariaPlaybackSpeed')
    expect(speedButton.textContent).toBe('1x')

    fireEvent.click(speedButton)
    expect(usePlayerStore.getState().playbackRate).toBe(1.25)
    expect(screen.getByLabelText('ariaPlaybackSpeed').textContent).toBe('1.25x')
  })

  it('exposes aria labels for progress and volume sliders', () => {
    render(<MiniPlayer />)

    expect(screen.getByLabelText('ariaPlaybackProgress')).toBeTruthy()
    expect(screen.getByLabelText('ariaVolumeSlider')).toBeTruthy()
  })

  it('keeps volume controls enabled when no track is loaded', () => {
    usePlayerStore.setState({
      audioLoaded: false,
      audioTitle: undefined,
      audioUrl: undefined,
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
})
