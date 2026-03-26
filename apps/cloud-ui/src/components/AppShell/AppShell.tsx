import { AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
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

  const isSurfaceVisible = mode === 'docked' || mode === 'full'

  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      {/* Unified Player Surface Frame rendered at top level to ensure fixed positioning integrity */}
      <AnimatePresence mode="popLayout">
        {isSurfaceVisible && <PlayerSurfaceFrame mode={mode} />}
      </AnimatePresence>

      <Sidebar />

      <main className="flex-1 flex flex-col relative bg-background overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 h-full overflow-hidden relative">
          <div className="h-full overflow-y-auto pb-mini-player custom-scrollbar">{children}</div>
        </div>
      </main>

      {/* MiniPlayer always in tree for shared element transitions */}
      <MiniPlayer />
    </div>
  )
}
