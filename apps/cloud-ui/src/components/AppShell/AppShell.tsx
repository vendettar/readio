import { AnimatePresence } from 'framer-motion'
import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerSurfaceStore } from '../../store/playerSurfaceStore'
import { MiniPlayer } from './MiniPlayer'
import { PlayerSurfaceFrame } from './PlayerSurfaceFrame'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  // Use atomic selector to avoid subscribing to entire store
  const mode = usePlayerSurfaceStore((s) => s.mode)
  const previousOverflowRef = useRef<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarPreviousOverflowRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const state = usePlayerSurfaceStore.getState()
      if (state.mode === 'docked') {
        state.toMini()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    const isImmersed = mode === 'full'

    if (isImmersed) {
      previousOverflowRef.current = body.style.overflow
      body.style.overflow = 'hidden'
    } else if (previousOverflowRef.current !== null) {
      body.style.overflow = previousOverflowRef.current
      previousOverflowRef.current = null
    }

    return () => {
      if (isImmersed) {
        body.style.overflow = previousOverflowRef.current ?? ''
        previousOverflowRef.current = null
      }
    }
  }, [mode])

  // Auto-close sidebar when crossing into desktop breakpoint
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mql = window.matchMedia('(min-width: 768px)')
    const handleDesktopBreakpoint = (e: MediaQueryListEvent) => {
      if (e.matches && sidebarOpen) {
        setSidebarOpen(false)
      }
    }

    // Also check on mount in case user is already on desktop
    if (mql.matches && sidebarOpen) {
      setSidebarOpen(false)
    }

    mql.addEventListener('change', handleDesktopBreakpoint)
    return () => {
      mql.removeEventListener('change', handleDesktopBreakpoint)
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body

    if (sidebarOpen) {
      if (body.style.overflow === 'hidden') {
        sidebarPreviousOverflowRef.current = null
        return
      }
      sidebarPreviousOverflowRef.current = body.style.overflow
      body.style.overflow = 'hidden'
    } else if (sidebarPreviousOverflowRef.current !== null) {
      const currentOverflow = body.style.overflow
      if (currentOverflow === 'hidden' && mode === 'full') {
        sidebarPreviousOverflowRef.current = null
        return
      }
      body.style.overflow = sidebarPreviousOverflowRef.current
      sidebarPreviousOverflowRef.current = null
    }

    return () => {
      if (sidebarPreviousOverflowRef.current !== null) {
        const currentOverflow = body.style.overflow
        if (currentOverflow === 'hidden' && mode === 'full') {
          sidebarPreviousOverflowRef.current = null
          return
        }
        body.style.overflow = sidebarPreviousOverflowRef.current
        sidebarPreviousOverflowRef.current = null
      }
    }
  }, [sidebarOpen, mode])

  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  const hamburgerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
        // Return focus to hamburger after close
        requestAnimationFrame(() => {
          hamburgerRef.current?.focus()
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [sidebarOpen])

  const isSurfaceVisible = mode === 'docked' || mode === 'full'

  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      {/* Unified Player Surface Frame rendered at top level to ensure fixed positioning integrity */}
      <AnimatePresence mode="popLayout">
        {isSurfaceVisible && <PlayerSurfaceFrame mode={mode} />}
      </AnimatePresence>

      <Sidebar open={sidebarOpen} onClose={handleSidebarClose} onNavigate={handleSidebarClose} />

      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-sidebar"
          onClick={handleSidebarClose}
          aria-hidden="true"
        />
      )}

      <main className="flex-1 flex flex-col relative bg-background overflow-hidden">
        {/* Hamburger menu button - mobile only */}
        {mode !== 'full' && (
          <div className="md:hidden flex items-center px-4 py-3 border-b border-border/50">
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              aria-expanded={sidebarOpen}
              aria-label="Open sidebar navigation"
            >
              <Menu size={24} />
            </button>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 h-0 overflow-hidden relative">
          <div className="h-full overflow-y-auto pb-mini-player custom-scrollbar">{children}</div>
        </div>
      </main>

      {/* MiniPlayer always in tree for shared element transitions */}
      <MiniPlayer />
    </div>
  )
}
