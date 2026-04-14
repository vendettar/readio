import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import { usePlayerSurfaceStore } from '../../../store/playerSurfaceStore'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { PlayerSurfaceFrame } from '../PlayerSurfaceFrame'

// Minimal Mocks
vi.mock('../../../hooks/useZoom', () => ({
  useZoom: () => ({ zoomScale: 1 }),
}))
vi.mock('../../../hooks/usePageVisibility', () => ({
  usePageVisibility: () => true,
}))
vi.mock('../../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))
vi.mock('../../../hooks/useImageObjectUrl', () => ({
  useImageObjectUrl: () => null,
}))

vi.mock('../ReadingContent', () => ({
  ReadingContent: () => <div data-testid="reading-content" />,
}))

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg data-testid="icon-chevron-down" />,
  Loader2: () => <svg />,
  Maximize2: () => <svg />,
  Minimize2: () => <svg data-testid="icon-minimize" />,
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
      children?: ReactNode
      className?: string
      layout?: unknown
      layoutId?: unknown
      [key: string]: unknown
    }) => (
      <div className={className} {...rest}>
        {children}
      </div>
    ),
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  },
}))

vi.mock('../../FollowButton', () => ({ FollowButton: () => null }))
vi.mock('../../Player/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('../../Player/SleepTimerButton', () => ({
  SleepTimerButton: ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => {
    const [open, setOpen] = useState(false)
    const toggle = () => {
      const next = !open
      setOpen(next)
      onOpenChange?.(next)
    }

    return (
      <div>
        <button type="button" aria-label="sleep-timer" onClick={toggle}>
          sleep
        </button>
        {open ? <div data-player-overlay-owned="true" data-testid="sleep-timer-overlay" /> : null}
      </div>
    )
  },
}))
vi.mock('../../ReadingBgControl', () => ({ ReadingBgControl: () => null }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('PlayerSurfaceFrame - Dismiss Interactions', () => {
  const toMiniSpy = vi.fn()
  const toDockedSpy = vi.fn()
  const toFullSpy = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    usePlayerSurfaceStore.setState({
      toMini: toMiniSpy,
      toDocked: toDockedSpy,
      toFull: toFullSpy,
      canDockedRestore: true,
      mode: 'full',
    })
    usePlayerStore.setState({
      audioLoaded: true,
      audioTitle: 'Test Title',
    })
  })

  it('Full Mode: Minimize button triggers exit to docked when restorable', () => {
    render(<PlayerSurfaceFrame mode="full" />)

    const minimizeBtn = screen.getByLabelText('ariaMinimize')
    fireEvent.click(minimizeBtn)

    expect(toDockedSpy).toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()
  })

  it('Full Mode: Minimize button triggers exit to mini when NOT restorable', () => {
    usePlayerSurfaceStore.setState({ canDockedRestore: false })
    render(<PlayerSurfaceFrame mode="full" />)

    const minimizeBtn = screen.getByLabelText('ariaMinimize')
    fireEvent.click(minimizeBtn)

    expect(toMiniSpy).toHaveBeenCalled()
    expect(toDockedSpy).not.toHaveBeenCalled()
  })

  it('Full Mode: frame click does NOT trigger exit', () => {
    render(<PlayerSurfaceFrame mode="full" />)

    const frame = screen.getByTestId('player-surface-frame')
    fireEvent.click(frame)

    expect(toDockedSpy).not.toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()
  })

  it('Docked Mode: frame click does NOT trigger exit', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    render(<PlayerSurfaceFrame mode="docked" />)

    const frame = screen.getByTestId('player-surface-frame')
    fireEvent.click(frame)

    expect(toMiniSpy).not.toHaveBeenCalled()
    expect(toDockedSpy).not.toHaveBeenCalled()
  })

  it('Full Mode: frame right-click does NOT trigger exit', () => {
    render(<PlayerSurfaceFrame mode="full" />)

    const frame = screen.getByTestId('player-surface-frame')
    fireEvent.contextMenu(frame)

    expect(toDockedSpy).not.toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()
  })

  it('Full Mode: exposes modal dialog semantics', () => {
    render(<PlayerSurfaceFrame mode="full" />)
    const frame = screen.getByTestId('player-surface-frame')

    expect(frame.getAttribute('role')).toBe('dialog')
    expect(frame.getAttribute('aria-modal')).toBe('true')
    const labelledBy = frame.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(labelledBy ? document.getElementById(labelledBy) : null).toBeTruthy()
  })

  it('Docked Mode: does not expose modal dialog semantics', () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    render(<PlayerSurfaceFrame mode="docked" />)
    const frame = screen.getByTestId('player-surface-frame')

    expect(frame.getAttribute('role')).toBeNull()
    expect(frame.getAttribute('aria-modal')).toBeNull()
    expect(frame.getAttribute('aria-labelledby')).toBeNull()
  })

  it('Full Mode: Escape key triggers exit handler path', () => {
    render(<PlayerSurfaceFrame mode="full" />)
    const frame = screen.getByTestId('player-surface-frame')

    fireEvent.keyDown(frame, { key: 'Escape' })
    expect(toDockedSpy).toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()
  })

  it('Full Mode: nested player overlay Escape does not directly dismiss full player', async () => {
    render(<PlayerSurfaceFrame mode="full" />)

    const settingsBtn = screen.getByLabelText('ariaSettings')
    fireEvent.click(settingsBtn)

    await waitFor(() => {
      const overlay = document.querySelector('[data-player-overlay-owned="true"]')
      expect(overlay).toBeTruthy()
    })
    const overlay = document.querySelector('[data-player-overlay-owned="true"]')
    expect(overlay).toBeTruthy()

    fireEvent.keyDown(overlay as HTMLElement, { key: 'Escape' })

    expect(toDockedSpy).not.toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()
  })

  it('Full Mode: sleep timer overlay Escape does not directly dismiss full player', async () => {
    render(<PlayerSurfaceFrame mode="full" />)

    fireEvent.click(screen.getByLabelText('sleep-timer'))

    await waitFor(() => {
      expect(screen.getByTestId('sleep-timer-overlay')).toBeTruthy()
    })

    fireEvent.keyDown(screen.getByTestId('sleep-timer-overlay'), { key: 'Escape' })

    expect(toDockedSpy).not.toHaveBeenCalled()
    expect(toMiniSpy).not.toHaveBeenCalled()
  })

  it('Full Mode: initial focus lands on minimize button', async () => {
    render(<PlayerSurfaceFrame mode="full" />)
    const minimizeBtn = screen.getByLabelText('ariaMinimize')

    await waitFor(() => {
      expect(document.activeElement).toBe(minimizeBtn)
    })
  })

  it('Full Mode: no-track state still focuses a valid minimize target', async () => {
    usePlayerStore.setState({
      audioTitle: '',
      audioUrl: '',
    })

    render(<PlayerSurfaceFrame mode="full" />)
    const minimizeBtn = screen.getByLabelText('ariaMinimize')

    await waitFor(() => {
      expect(document.activeElement).toBe(minimizeBtn)
    })
  })

  it('Full Mode: Tab key containment returns focus into modal when focus drifts outside', async () => {
    render(<PlayerSurfaceFrame mode="full" />)
    const frame = screen.getByTestId('player-surface-frame')
    const minimizeBtn = screen.getByLabelText('ariaMinimize')

    await waitFor(() => {
      expect(document.activeElement).toBe(minimizeBtn)
    })

    const externalButton = document.createElement('button')
    externalButton.type = 'button'
    externalButton.textContent = 'external'
    document.body.appendChild(externalButton)
    externalButton.focus()

    fireEvent.keyDown(frame, { key: 'Tab' })

    await waitFor(() => {
      expect(document.activeElement).toBe(minimizeBtn)
    })

    externalButton.remove()
  })

  it('Full Mode: restores focus to previously focused external element on exit', async () => {
    const externalButton = document.createElement('button')
    externalButton.type = 'button'
    externalButton.textContent = 'outside'
    document.body.appendChild(externalButton)
    externalButton.focus()

    const { rerender } = render(<PlayerSurfaceFrame mode="full" />)
    const minimizeBtn = screen.getByLabelText('ariaMinimize')

    await waitFor(() => {
      expect(document.activeElement).toBe(minimizeBtn)
    })

    rerender(<PlayerSurfaceFrame mode="docked" />)

    await waitFor(() => {
      expect(document.activeElement).toBe(externalButton)
    })

    externalButton.remove()
  })

  // TODO(player-surface): re-enable when docked mode restores an explicit
  // expand-to-full trigger again. The current product contract removed the
  // `ariaOpenQueue` entry point, so this focus-return path is not reachable.
  it.skip('Full Mode: exit restores focus to docked expand trigger origin', async () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    useTranscriptStore.setState({
      subtitlesLoaded: true,
      subtitles: [{ start: 0, end: 1, text: 'origin' }],
      transcriptIngestionStatus: 'idle',
    })
    const { rerender } = render(<PlayerSurfaceFrame mode="docked" />)

    const expandBtn = screen.getByLabelText('ariaOpenQueue')
    expandBtn.focus()
    fireEvent.click(expandBtn)

    rerender(<PlayerSurfaceFrame mode="full" />)
    const minimizeBtn = screen.getByLabelText('ariaMinimize')
    await waitFor(() => {
      expect(document.activeElement).toBe(minimizeBtn)
    })

    rerender(<PlayerSurfaceFrame mode="docked" />)
    const remountedExpandBtn = screen.getByLabelText('ariaOpenQueue')
    await waitFor(() => {
      expect(document.activeElement).toBe(remountedExpandBtn)
    })
  })
})
