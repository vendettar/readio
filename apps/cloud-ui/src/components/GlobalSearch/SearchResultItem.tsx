import type React from 'react'
import { cn } from '../../lib/utils'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'

interface SearchResultItemProps {
  title: string
  subtitle?: React.ReactNode
  extraSubtitle?: React.ReactNode
  artworkUrl?: string
  artworkBlob?: Blob
  onClick: () => void
  onArtworkClick?: (e: React.MouseEvent) => void
  rightIcon?: React.ElementType
  className?: string
  artworkAriaLabel?: string
}

export function SearchResultItem({
  title,
  subtitle,
  extraSubtitle,
  artworkUrl,
  artworkBlob,
  onClick,
  onArtworkClick,
  rightIcon: RightIcon,
  className,
  artworkAriaLabel,
}: SearchResultItemProps) {
  const artworkClickProps = onArtworkClick
    ? {
        onPlay: onArtworkClick,
        playIconSize: 14,
        hoverGroup: 'item' as const,
      }
    : {}

  const content = (
    <div className={cn('flex-1 min-w-0', onArtworkClick && 'relative')}>
      <div className={cn(onArtworkClick && 'flex flex-col flex-1 min-w-0')}>
        {extraSubtitle && (
          <div className="text-xxs uppercase tracking-wider text-muted-foreground/80 font-bold mb-0.5 pointer-events-none">
            {extraSubtitle}
          </div>
        )}
        <div className="mb-0.5 relative">
          <InteractiveTitle
            title={title}
            onClick={onClick}
            className="text-sm leading-5 font-semibold"
          />
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground truncate pointer-events-none mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        'w-full flex items-center gap-3 p-2 rounded-xl transition-all text-start justify-start group whitespace-normal relative',
        className
      )}
    >
      {/* Hover Background Overlay */}
      <div className="absolute inset-0 rounded-xl bg-foreground/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <InteractiveArtwork
        src={artworkUrl}
        blob={artworkBlob}
        imageSize={100}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        }}
        className={cn(
          'relative w-12 h-12 flex-shrink-0',
          !onArtworkClick && 'hover:opacity-90 transition-opacity cursor-pointer'
        )}
        playLabel={artworkAriaLabel ?? title}
        {...artworkClickProps}
      />

      {content}

      {RightIcon && (
        <div className="flex-shrink-0 ms-auto me-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <RightIcon className="w-4 h-4 text-muted-foreground/60" />
        </div>
      )}
    </div>
  )
}
