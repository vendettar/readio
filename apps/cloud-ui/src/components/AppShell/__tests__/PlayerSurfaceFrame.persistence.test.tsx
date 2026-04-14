import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import { usePlayerSurfaceStore } from '../../../store/playerSurfaceStore'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { PlayerSurfaceFrame } from '../PlayerSurfaceFrame'

const readingContentMountSpy = vi.fn()

// Mock ReadingContent to track mount cycles
vi.mock('../ReadingContent', () => ({
  ReadingContent: ({ variant }: { variant: string }) => {
    useEffect(() => {
      readingContentMountSpy()
    }, [])
    return <div data-testid="reading-content" data-variant={variant} />
  },
}))

// Minimal Mocks for dependencies
vi.mock('../../hooks/useZoom', () => ({
  useZoom: () => ({ zoomScale: 1 }),
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

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg />,
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
      layout: _layout,
      layoutId: _layoutId,
      ...rest
    }: {
      children: React.ReactNode
      className?: string
      layout?: unknown
      layoutId?: unknown
      [key: string]: unknown
    }) => (
      <div className={className} {...rest}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../../FollowButton', () => ({
  FollowButton: () => <div />,
}))
vi.mock('../../Player/ShareButton', () => ({
  ShareButton: () => <div />,
}))
vi.mock('../../Player/SleepTimerButton', () => ({
  SleepTimerButton: () => <div />,
}))
vi.mock('../../ReadingBgControl', () => ({
  ReadingBgControl: () => <div />,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('PlayerSurfaceFrame - ReadingContent Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    act(() => {
      usePlayerSurfaceStore.getState().reset()
      usePlayerStore.setState({
        audioLoaded: true,
        audioTitle: 'Test',
      })
      useTranscriptStore.setState({
        subtitlesLoaded: true,
      })
    })
  })

  it('keeps ReadingContent mounted when switching from docked to full', () => {
    const { rerender } = render(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.getByTestId('reading-content')).toBeTruthy()
    expect(screen.getByTestId('reading-content').getAttribute('data-variant')).toBe('docked')
    expect(readingContentMountSpy).toHaveBeenCalledTimes(1)

    // Switch to full
    rerender(<PlayerSurfaceFrame mode="full" />)

    expect(screen.getByTestId('reading-content')).toBeTruthy()
    expect(screen.getByTestId('reading-content').getAttribute('data-variant')).toBe('full')

    // Crucially: mount spy should still be 1 if it didn't unmount/remount
    expect(readingContentMountSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps ReadingContent mounted when switching from full to docked', () => {
    const { rerender } = render(<PlayerSurfaceFrame mode="full" />)

    expect(screen.getByTestId('reading-content')).toBeTruthy()
    expect(screen.getByTestId('reading-content').getAttribute('data-variant')).toBe('full')
    expect(readingContentMountSpy).toHaveBeenCalledTimes(1)

    // Switch to docked
    rerender(<PlayerSurfaceFrame mode="docked" />)

    expect(screen.getByTestId('reading-content')).toBeTruthy()
    expect(screen.getByTestId('reading-content').getAttribute('data-variant')).toBe('docked')

    expect(readingContentMountSpy).toHaveBeenCalledTimes(1)
  })
})
