import type * as React from 'react'
import { cn } from '../../lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

export function Progress({ value = 0, className, ...props }: ProgressProps) {
  const safeValue = Math.min(100, Math.max(0, value))

  return (
    <div
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-primary transition-transform duration-500"
        style={{ transform: `translateX(-${100 - safeValue}%)` }}
      />
    </div>
  )
}
