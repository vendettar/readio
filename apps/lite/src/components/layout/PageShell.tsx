import type React from 'react'
import { cn } from '../../lib/utils'

interface PageShellProps {
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

/**
 * Standard Page Shell for all top-level routes.
 * Enforces max-width, horizontal padding, and vertical rhythm.
 */
export function PageShell({ children, className, contentClassName }: PageShellProps) {
  return (
    <div className={cn('h-full bg-background text-foreground flex flex-col', className)}>
      <div
        className={cn(
          'w-full max-w-content mx-auto px-page pt-page pb-32 min-h-full',
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}
