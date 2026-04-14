import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stub deep sub-dependencies, NOT Sidebar itself
const mockLocation = { pathname: '/', search: '' }

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useLocation: () => mockLocation,
    useRouterState: () => ({ location: mockLocation }),
    Link: ({
      children,
      to,
      onClick: _onClick,
    }: {
      children: ReactNode
      to: string
      onClick?: () => void
    }) => (
      <button type="button" data-testid={`nav-link-${to}`} onClick={_onClick}>
        {children}
      </button>
    ),
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: 'en' },
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}))

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: () => ({ mode: 'hidden', toMini: () => {} }),
}))

vi.mock('../../store/themeStore', () => ({
  useThemeStore: (sel: (s: { theme: string; toggleTheme: () => void }) => unknown) =>
    sel({ theme: 'light', toggleTheme: () => {} }),
}))

vi.mock('../../hooks/useGlobalSearch', () => ({
  useGlobalSearch: () => ({
    podcasts: [],
    episodes: [],
    local: [],
    isLoading: false,
    isEmpty: true,
  }),
}))

vi.mock('../../hooks/useLocalSearch', () => ({
  useLocalSearch: () => ({ results: [], isLoading: false }),
}))

vi.mock('../GlobalSearch', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}))

vi.mock('../ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children, asChild }: { children?: ReactNode; asChild?: boolean }) =>
    asChild ? children : <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../ui/Logo', () => ({
  Logo: ({ size }: { size: number }) => <div data-testid="logo" style={{ width: size }} />,
}))

vi.mock('../ui/button', () => ({
  Button: forwardRef<
    HTMLButtonElement,
    {
      children: ReactNode
      onClick?: () => void
      className?: string
      'aria-label'?: string
      type?: 'button' | 'submit' | 'reset'
    }
  >(function Button({ children, onClick, className, 'aria-label': ariaLabel, type }, ref) {
    return (
      <button
        type={type || 'button'}
        onClick={onClick}
        className={className}
        aria-label={ariaLabel}
        ref={ref}
      >
        {children}
      </button>
    )
  }),
}))

vi.mock('../ui/error-boundary', () => ({
  ComponentErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../MiniPlayer', () => ({
  MiniPlayer: () => <div data-testid="mini-player" />,
}))

vi.mock('../PlayerSurfaceFrame', () => ({
  PlayerSurfaceFrame: ({ mode }: { mode: string }) => (
    <div data-testid="player-surface-frame" data-mode={mode} />
  ),
}))

vi.mock('../../lib/utils', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/utils')>('../../../lib/utils')
  return { ...actual, cn: (...args: string[]) => args.filter(Boolean).join(' ') }
})

import { AppShell } from '../AppShell'
// Import real Sidebar and AppShell
import { Sidebar } from '../Sidebar'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function renderWithProviders(ui: ReactNode) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function getBackdrop(): Element | null {
  return document.querySelector('[class*="bg-black/50"]')
}

function getHamburger(): HTMLElement | null {
  return screen.queryByRole('button', { name: /open sidebar/i })
}

describe('MobileSidebar — real Sidebar behavior', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
    document.body.style.overflow = ''
    mockLocation.pathname = '/'
    mockLocation.search = ''
  })

  describe('Real Sidebar rendering', () => {
    it('real Sidebar renders with hidden class when drawer is closed', () => {
      const { container } = renderWithProviders(<Sidebar open={false} onClose={() => {}} />)
      const aside = container.querySelector('aside')
      expect(aside).toBeTruthy()
      expect(aside?.className).toContain('hidden')
      expect(aside?.className).toContain('md:flex')
    })

    it('real Sidebar renders with drawer classes when open', () => {
      const { container } = renderWithProviders(<Sidebar open onClose={() => {}} />)
      const aside = container.querySelector('aside')
      expect(aside).toBeTruthy()
      expect(aside?.className).toContain('start-0')
      expect(aside?.className).toContain('z-overlay')
      expect(aside?.className).toContain('w-64')
    })

    it('close button is present and receives focus when drawer opens', async () => {
      const { getByRole } = renderWithProviders(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')

      await act(async () => {
        fireEvent.click(hamburger)
      })

      const closeBtn = getByRole('button', { name: /close sidebar/i })
      expect(closeBtn.className).toContain('md:hidden')
      expect(document.activeElement).toBe(closeBtn)
    })

    it('close button is absent when drawer is closed', () => {
      const { queryByRole } = renderWithProviders(<Sidebar open={false} onClose={() => {}} />)
      const closeBtn = queryByRole('button', { name: /close sidebar/i })
      expect(closeBtn).toBeNull()
    })
  })

  describe('Close interactions', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn()
      const { getByRole } = renderWithProviders(<Sidebar open onClose={onClose} />)
      const closeBtn = getByRole('button', { name: /close sidebar/i })
      fireEvent.click(closeBtn)
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when a navigation link is clicked', () => {
      const onClose = vi.fn()
      const { getAllByRole } = renderWithProviders(<Sidebar open onClose={onClose} />)
      const navButtons = getAllByRole('button').filter(
        (btn) =>
          btn.textContent &&
          !btn.textContent.includes('Close') &&
          !btn.textContent.includes('Theme')
      )
      if (navButtons.length > 0) {
        fireEvent.click(navButtons[0])
        expect(onClose).toHaveBeenCalled()
      }
    })
  })

  describe('AppShell + real Sidebar integration', () => {
    it('hamburger click opens real sidebar', () => {
      renderWithProviders(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      const closeBtn = screen.queryByRole('button', { name: /close sidebar/i })
      expect(closeBtn).toBeTruthy()
    })

    it('backdrop click closes real sidebar', () => {
      renderWithProviders(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(getBackdrop()).toBeTruthy()

      const backdrop = getBackdrop()
      if (backdrop) fireEvent.click(backdrop)

      expect(screen.queryByRole('button', { name: /close sidebar/i })).toBeNull()
    })

    it('ESC key closes real sidebar', () => {
      renderWithProviders(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(screen.queryByRole('button', { name: /close sidebar/i })).toBeTruthy()

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(screen.queryByRole('button', { name: /close sidebar/i })).toBeNull()
    })

    it('pathname change closes real sidebar', () => {
      const { rerender } = renderWithProviders(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)
      expect(screen.queryByRole('button', { name: /close sidebar/i })).toBeTruthy()

      act(() => {
        mockLocation.pathname = '/explore'
      })
      rerender(
        <QueryClientProvider client={queryClient}>
          <AppShell>Content</AppShell>
        </QueryClientProvider>
      )

      expect(screen.queryByRole('button', { name: /close sidebar/i })).toBeNull()
    })

    it('search-only route change closes real sidebar', () => {
      const { rerender } = renderWithProviders(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)
      expect(screen.queryByRole('button', { name: /close sidebar/i })).toBeTruthy()

      act(() => {
        mockLocation.pathname = '/'
        mockLocation.search = '?q=episode'
      })
      rerender(
        <QueryClientProvider client={queryClient}>
          <AppShell>Content</AppShell>
        </QueryClientProvider>
      )

      expect(screen.queryByRole('button', { name: /close sidebar/i })).toBeNull()
    })
  })

  describe('Body scroll lock', () => {
    it('sidebar open locks body scroll', () => {
      renderWithProviders(<AppShell>Content</AppShell>)

      expect(document.body.style.overflow).toBe('')

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('sidebar close restores body scroll', () => {
      renderWithProviders(<AppShell>Content</AppShell>)

      const hamburger = getHamburger()
      if (!hamburger) throw new Error('Hamburger not found')
      fireEvent.click(hamburger)
      expect(document.body.style.overflow).toBe('hidden')

      const backdrop = getBackdrop()
      if (backdrop) fireEvent.click(backdrop)

      expect(document.body.style.overflow).toBe('')
    })
  })
})
