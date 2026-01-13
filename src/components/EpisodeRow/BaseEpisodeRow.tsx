import type React from 'react'
import { cn } from '@/lib/utils'

export interface BaseEpisodeRowProps {
  /**
   * The artwork component, typically InteractiveArtwork.
   * If not provided, a play button overlay or placeholder layout might be needed depending on usage.
   */
  artwork?: React.ReactNode

  /**
   * The title component, typically InteractiveTitle.
   */
  title: React.ReactNode

  /**
   * Optional subtitle, e.g. podcast name in a search result or "Show Name • Date".
   */
  subtitle?: React.ReactNode

  /**
   * Plain text description to be truncated.
   */
  description?: React.ReactNode

  /**
   * Metadata line, e.g. duration, progress, etc.
   */
  meta?: React.ReactNode

  /**
   * Actions area, e.g. Favorite button, Menu.
   */
  actions?: React.ReactNode

  /**
   * Class name for the outer container.
   */
  className?: string

  /**
   * Number of lines to clamp the description to. Defaults to 2.
   */
  descriptionLines?: number

  /**
   * Whether to show the bottom divider. Defaults to true.
   */
  showDivider?: boolean

  /**
   * Whether this is the last item in a list (hides divider).
   */
  isLast?: boolean
}

export function BaseEpisodeRow({
  artwork,
  title,
  subtitle,
  description,
  meta,
  actions,
  className,
  descriptionLines = 2,
  showDivider = true,
  isLast = false,
}: BaseEpisodeRowProps) {
  return (
    <div
      className={cn(
        'group/episode relative pr-4',
        'focus-within:bg-secondary/20 hover:bg-secondary/10 transition-colors duration-200 rounded-lg',
        className
      )}
      data-testid="episode-row"
    >
      <div className="relative flex items-center gap-4 py-3">
        {/* Artwork Area */}
        {artwork && <div className="relative flex-shrink-0">{artwork}</div>}

        <div className="flex-1 min-w-0 flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-12 py-1">
            {/* Subtitle / Top Meta */}
            {subtitle && (
              <div className="text-xxs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider leading-tight line-clamp-1">
                {subtitle}
              </div>
            )}

            {/* Title */}
            <div className="mb-0.5 relative text-sm leading-tight">{title}</div>

            {/* Description */}
            {description && (
              <p
                className={cn(
                  'text-xs text-muted-foreground leading-snug font-light mt-1 line-clamp-2',
                  descriptionLines === 3 && 'line-clamp-3'
                )}
              >
                {description}
              </p>
            )}
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center flex-shrink-0 gap-12">
            {meta && (
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap w-20 text-left">
                {meta}
              </span>
            )}

            {actions && (
              <div className="flex items-center gap-1 opacity-0 group-hover/episode:opacity-100 group-focus-within/episode:opacity-100 transition-opacity duration-200">
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Separator */}
      {showDivider && !isLast && (
        <div className="absolute bottom-0 left-0 right-4 h-px bg-border group-hover/episode:opacity-0 transition-opacity smart-divider" />
      )}
    </div>
  )
}
