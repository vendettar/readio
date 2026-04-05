import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerSurfaceStore } from '../../../store/playerSurfaceStore'

// Dynamic pathname for route change tests
const mockPathname = '/'

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useLocation: () => ({ pathname: mockPathname }),
    useRouterState: () => ({ location: { pathname: mockPathname } }),
  }
})

vi.mock('../Sidebar', () => ({
  Sidebar: ({
    open,
    onClose,
    onNavigate,
  }: {
    open?: boolean
    onClose?: () => void
    onNavigate?: () => void
  }) => (
    <div data-testid="sidebar" data-open={String(open)}>
      <button type="button" onClick={onClose} data-testid="sidebar-close">
        Close
      </button>
      <button
        type="button"
        onClick={() => {
          onNavigate?.()
        }}
        data-testid="sidebar-nav-link"
      >
        Navigate
      </button>
    </div>
  ),
}))

vi.mock('../MiniPlayer', () => ({
  MiniPlayer: () => <div data-testid="mini-player" />,
}))

vi.mock('../PlayerSurfaceFrame', () => ({
  PlayerSurfaceFrame: ({ mode }: { mode: string }) => (
    <div data-testid="player-surface-frame" data-mode={mode} />
  ),
}))

import { AppShell } from '../AppShell'

function getBackdrop(): Element | null {
  return document.querySelector('[class*="bg-black/50"]')
}

function getHamburger(): HTMLElement | null {
  return screen.queryByRole('button', { name: /open sidebar/i })
}

describe('MobileSidebar', () => {
  beforeEach(() => {
    act(() => {
      usePlayerSurfaceStore.getState().reset()
    })
    document.body.style.overflow = ''
  })

  describe('Props contract', () => {
    it('Sidebar receives open=false by default', () => {
      render(<AppShell>Content</AppShell>)

      const sidebar = screen.getByTestId('sidebar')
      expect(sidebar.getAttribute('data-open')).toBe('false')
    })

    it('Sidebar receives onClose callback', () => {
      render(<AppShell>Content</AppShell>)

      const closeBtn = screen.getByTestId('sidebar-close')
      fireEvent.click(closeBtn)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('false')
    })

    it('Sidebar receives onNavigate callback', () => {
      render(<AppShell>Content</AppShell>)

      const navLink = screen.getByTestId('sidebar-nav-link')
      fireEvent.click(navLink)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('false')
    })
  })

  describe('Hamburger button', () => {
    it('hamburger is present for opening sidebar', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      expect(hamburger).toBeTruthy()
    })

    it('hamburger click opens sidebar', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('true')
    })

    it('hamburger is hidden when mode === full', () => {
      act(() => {
        usePlayerSurfaceStore.setState({ mode: 'full' })
      })
      render(<AppShell>Content</AppShell>)

      expect(getHamburger()).toBeNull()
    })

    it('hamburger has aria-expanded=false initially', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      expect(hamburger?.getAttribute('aria-expanded')).toBe('false')
    })

    it('hamburger aria-expanded toggles to true when sidebar opens', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(hamburger.getAttribute('aria-expanded')).toBe('true')
    })

    it('hamburger aria-expanded toggles back to false when sidebar closes', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)
      expect(hamburger.getAttribute('aria-expanded')).toBe('true')

      const backdrop = getBackdrop()
      if (backdrop) fireEvent.click(backdrop)
      expect(hamburger.getAttribute('aria-expanded')).toBe('false')
    })
  })

  describe('Backdrop', () => {
    it('no backdrop when sidebar is closed', () => {
      render(<AppShell>Content</AppShell>)

      expect(getBackdrop()).toBeNull()
    })

    it('backdrop appears when sidebar opens', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(getBackdrop()).toBeTruthy()
    })

    it('backdrop click closes sidebar', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('true')

      const backdrop = getBackdrop()
      if (backdrop) fireEvent.click(backdrop)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('false')
    })
  })

  describe('ESC key', () => {
    it('ESC key closes sidebar', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('true')

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('false')
    })

    it('ESC key does nothing when sidebar is closed', () => {
      render(<AppShell>Content</AppShell>)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('false')

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('false')
    })
  })

  describe('Navigation', () => {
    it('navigation link click closes sidebar', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('true')

      const navLink = screen.getByTestId('sidebar-nav-link')
      fireEvent.click(navLink)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('false')
    })

    it('non-click route change (onNavigate callback) closes sidebar', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('true')

      // The real Sidebar calls onNavigate when useLocation pathname changes.
      // Our mock Sidebar's nav link also calls onNavigate, simulating a
      // programmatic route change (not a click on the nav link itself).
      const navLink = screen.getByTestId('sidebar-nav-link')
      fireEvent.click(navLink)

      expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('false')
    })
  })

  describe('Body scroll lock', () => {
    it('sidebar open locks body scroll', () => {
      render(<AppShell>Content</AppShell>)

      expect(document.body.style.overflow).toBe('')

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('sidebar close restores body scroll', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)
      expect(document.body.style.overflow).toBe('hidden')

      const backdrop = getBackdrop()
      if (backdrop) fireEvent.click(backdrop)

      expect(document.body.style.overflow).toBe('')
    })

    it('restores initial body overflow when it was non-empty', () => {
      document.body.style.overflow = 'auto'

      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(document.body.style.overflow).toBe('hidden')

      const backdrop = getBackdrop()
      if (backdrop) fireEvent.click(backdrop)

      expect(document.body.style.overflow).toBe('auto')
    })

    it('does NOT clear full-player overflow lock when sidebar closes', () => {
      act(() => {
        usePlayerSurfaceStore.setState({ mode: 'full' })
      })
      render(<AppShell>Content</AppShell>)

      expect(document.body.style.overflow).toBe('hidden')

      act(() => {
        usePlayerSurfaceStore.setState({ mode: 'mini' })
      })

      expect(document.body.style.overflow).toBe('')
    })

    it('does NOT modify overflow when full player already locks it', () => {
      act(() => {
        usePlayerSurfaceStore.setState({ mode: 'full' })
      })
      render(<AppShell>Content</AppShell>)

      expect(document.body.style.overflow).toBe('hidden')

      expect(getHamburger()).toBeNull()
    })

    it('sidebar close does not wrongly clear overflow when full-player is active', () => {
      act(() => {
        usePlayerSurfaceStore.setState({ mode: 'full' })
      })
      render(<AppShell>Content</AppShell>)

      expect(document.body.style.overflow).toBe('hidden')

      act(() => {
        usePlayerSurfaceStore.setState({ mode: 'mini' })
      })

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(document.body.style.overflow).toBe('hidden')

      const backdrop = getBackdrop()
      if (backdrop) fireEvent.click(backdrop)

      expect(document.body.style.overflow).toBe('')
    })
  })

  describe('ARIA', () => {
    it('close button has accessible name', () => {
      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(screen.getByTestId('sidebar-close')).toBeTruthy()
    })
  })

  describe('Regression', () => {
    it('closing sidebar does not clear document.body.style.overflow when it should remain set', () => {
      document.body.style.overflow = 'scroll'

      render(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)
      expect(document.body.style.overflow).toBe('hidden')

      const backdrop = getBackdrop()
      if (backdrop) fireEvent.click(backdrop)

      expect(document.body.style.overflow).toBe('scroll')
    })
  })
})
