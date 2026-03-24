import type React from 'react'
import { cn } from '../../lib/utils'

interface PageHeaderProps {
  /** Optional content to render above the title block (e.g., breadcrumbs, back button). */
  beforeTitle?: React.ReactNode
  /** Main route title (required). Dynamic titles follow overflow rules. */
  title: React.ReactNode
  /** Optional descriptive subtitle. */
  subtitle?: React.ReactNode
  /** Optional page-level actions rail. Stacks below title on mobile. */
  actions?: React.ReactNode
  /** Optional chips/counts/meta labels row. */
  meta?: React.ReactNode
  /** Additional classes for the header container. */
  className?: string
  /** Additional classes for the title h1. */
  titleClassName?: string
  /** Additional classes for the subtitle paragraph. */
  subtitleClassName?: string
}

/**
 * Standard Route Header following the Page Shell & Header Contract.
 *
 * Ensures consistent title scale, vertical rhythm, and mobile stacking rules.
 */
export function PageHeader({
  beforeTitle,
  title,
  subtitle,
  actions,
  meta,
  className,
  titleClassName,
  subtitleClassName,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-10', className)}>
      {beforeTitle && <div className="mb-4">{beforeTitle}</div>}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
        {/* Title Block */}
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              'text-3xl sm:text-4xl font-bold tracking-tight text-foreground line-clamp-2 break-words',
              titleClassName
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={cn(
                'mt-2 text-base sm:text-lg text-muted-foreground font-medium line-clamp-2 break-words',
                subtitleClassName
              )}
            >
              {subtitle}
            </p>
          )}
        </div>

        {/* Action Rail - wraps below title on mobile */}
        {actions && <div className="flex items-center gap-3 shrink-0 flex-wrap">{actions}</div>}
      </div>

      {/* Support Meta - sits below title/subtitle row */}
      {meta && <div className="mt-5 flex flex-wrap gap-2">{meta}</div>}
    </header>
  )
}
