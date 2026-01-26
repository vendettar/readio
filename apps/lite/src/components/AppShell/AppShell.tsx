import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useImmersionStore } from '../../store/immersionStore'
import { FullPlayer } from './FullPlayer'
import { MiniPlayer } from './MiniPlayer'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { isImmersed } = useImmersionStore()
  const previousOverflowRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body

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
  }, [isImmersed])

  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      <Sidebar />

      <main className="flex-1 flex flex-col relative bg-background overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 h-full overflow-hidden">
          <div className="h-full overflow-y-auto pb-mini-player">{children}</div>
        </div>
      </main>

      {/* MiniPlayer always in tree for shared element transitions */}
      <MiniPlayer />

      {/* Full Player Overlay */}
      {isImmersed && <FullPlayer />}
    </div>
  )
}
