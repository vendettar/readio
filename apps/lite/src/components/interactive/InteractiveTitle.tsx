import { Link } from '@tanstack/react-router'
import type React from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

interface InteractiveTitleProps {
  title: string
  to?: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  onClick?: (e: React.MouseEvent) => void
  className?: string
  buttonClassName?: string
  maxLines?: 1 | 2 | 3 | 4 | 5 | 6 | 'none'
}

const LINE_CLAMP_MAP: Record<string, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
  none: '',
} as const

/**
 * A reusable title component that follows the design system rules:
 * - Uses shadcn/ui Button (with asChild for links)
 * - Only the title is interactive
 * - Shows an underline on hover
 * - Supports both internal navigation (Link) and custom actions (onClick)
 */
export function InteractiveTitle({
  title,
  to,
  params,
  search,
  onClick,
  className,
  buttonClassName,
  maxLines = 2,
}: InteractiveTitleProps) {
  const clampClass = maxLines ? LINE_CLAMP_MAP[maxLines] : ''

  // If onClick is provided, we use a standard button to ensure it takes priority
  // or we wrap the link and handle it. Preferred: if onClick exists, treat as action button.
  if (onClick) {
    return (
      <Button
        variant="text"
        onClick={onClick}
        className={cn(
          'p-0 h-auto text-left font-semibold inline-flex items-start whitespace-normal justify-start self-start',
          buttonClassName,
          className
        )}
      >
        <span className={cn(clampClass, 'overflow-hidden')}>
          <span className="group-hover/episode:underline group-hover/item:underline group-hover/card:underline hover:underline">
            {title}
          </span>
        </span>
      </Button>
    )
  }

  if (to && params) {
    return (
      <Button
        asChild
        variant="text"
        className={cn(
          'p-0 h-auto text-left font-semibold inline-flex items-start whitespace-normal justify-start self-start',
          buttonClassName
        )}
      >
        <Link
          to={to as any}
          params={params as any}
          search={search as any}
          className={cn('transition-all', className)}
        >
          <span className={cn(clampClass, 'overflow-hidden')}>
            <span className="group-hover/episode:underline group-hover/item:underline group-hover/card:underline hover:underline">
              {title}
            </span>
          </span>
        </Link>
      </Button>
    )
  }

  return (
    <span
      className={cn(
        'text-left font-semibold inline-flex items-start whitespace-normal justify-start self-start',
        className
      )}
    >
      <span className={cn(clampClass, 'overflow-hidden transition-all')}>{title}</span>
    </span>
  )
}
