// src/components/AppShell/AppShell.tsx
import { lazy, type ReactNode, Suspense } from 'react'
import { useImmersionStore } from '../../store/immersionStore'
import { MiniPlayer } from './MiniPlayer'
import { Sidebar } from './Sidebar'

const LazyFullPlayer = lazy(() =>
  import('./FullPlayer').then((mod) => ({ default: mod.FullPlayer }))
)

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { isImmersed } = useImmersionStore()

  // Full Player mode - hide everything else
  if (isImmersed) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-background" />}>
        <LazyFullPlayer />
      </Suspense>
    )
  }

  // Normal mode - Sidebar + Content + MiniPlayer
  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      <Sidebar />

      <main className="flex-1 flex flex-col relative bg-background overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 h-full overflow-hidden">
          <div className="h-full overflow-y-auto pb-mini-player">{children}</div>
        </div>
      </main>

      <MiniPlayer />
    </div>
  )
}
