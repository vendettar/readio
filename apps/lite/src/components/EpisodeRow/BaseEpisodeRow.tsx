import type React from 'react'
import { cn } from '@/lib/utils'

export interface BaseEpisodeRowProps {
  /**
   * The artwork component, typically InteractiveArtwork.
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
   * Optional bottom metadata slot (e.g. playback progress, categories).
   * Unlike description, this is NOT clamped.
   */
  bottomMeta?: React.ReactNode

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

/**
 * BaseEpisodeRow: Standardized presentational component matching the original Readio UI.
 * Handles hover states, absolute gutter elements, and divider logic properly.
 */
export function BaseEpisodeRow({
  artwork,
  title,
  subtitle,
  description,
  meta,
  actions,
  bottomMeta,
  className,
  descriptionLines = 2,
  showDivider = true,
  isLast = false,
}: BaseEpisodeRowProps) {
  return (
    <div
      className={cn('group/episode relative pe-4 smart-divider-group', className)}
      data-testid="episode-row"
    >
      {/* 
        Hover Background Layer 
        - inset-y-0: Extends from top edge to bottom edge (divider).
        - Shifted left to cover the "gutter" area for episodes without artwork.
        - Rounded-lg matches the legacy design.
      */}
      <div
        className={cn(
          'absolute inset-y-0 -start-page-gutter end-0 rounded-lg bg-accent/50 opacity-0 group-hover/episode:opacity-100 transition-opacity duration-300 pointer-events-none z-0'
        )}
      />

      <div className="relative flex items-center gap-4 py-3 z-10">
        {/* Artwork Area - Optional */}
        {artwork && <div className="relative flex-shrink-0 z-20">{artwork}</div>}

        <div className="flex-1 min-w-0 flex items-center justify-between">
          <div className="flex-1 min-w-0 pe-12 py-1">
            {/* Subtitle Line (e.g. Podcast Title • Date) */}
            {subtitle && (
              <div className="text-xs text-muted-foreground/80 mb-0.5 line-clamp-1 font-normal tracking-tight">
                {subtitle}
              </div>
            )}

            {/* Title Line (Anchor for absolute gutter play buttons) */}
            <div className="mb-0.5 relative z-20">{title}</div>

            {/* Description Line */}
            {description && (
              <div
                className={cn(
                  'text-xs text-muted-foreground/80 leading-snug font-light mb-1',
                  descriptionLines === 1 && 'line-clamp-1',
                  descriptionLines === 2 && 'line-clamp-2',
                  descriptionLines === 3 && 'line-clamp-3'
                )}
              >
                {description}
              </div>
            )}

            {/* Bottom Meta (if any, e.g. history playback progress) */}
            {bottomMeta && <div className="mt-1">{bottomMeta}</div>}
          </div>

          {/* Right Side Actions & Post-Title Meta (e.g. Duration) */}
          <div className="flex items-center flex-shrink-0 gap-12">
            {meta && (
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap w-20 text-end">
                {meta}
              </span>
            )}

            {actions && (
              <div className="flex items-center gap-1">
                {/* 
                  Actions are kept in the DOM but usually only visible on hover 
                  Managed by the caller, but here we provide a stable container.
                */}
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Separator Line */}
      {showDivider && (
        <div
          className={cn(
            'absolute bottom-0 start-0 end-4 h-px bg-border/50 transition-opacity duration-200 smart-divider',
            'group-hover/episode:opacity-0', // Hide self on hover
            isLast && 'hidden'
          )}
        />
      )}
    </div>
  )
}
