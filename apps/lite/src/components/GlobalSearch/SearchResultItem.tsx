import { Play } from 'lucide-react'
import type React from 'react'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { cn } from '../../lib/utils'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { Button } from '../ui/button'

interface SearchResultItemProps {
  title: string
  subtitle?: React.ReactNode
  extraSubtitle?: React.ReactNode
  artworkUrl?: string
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
  onClick,
  onArtworkClick,
  rightIcon: RightIcon,
  className,
  artworkAriaLabel,
}: SearchResultItemProps) {
  if (!onArtworkClick) {
    return (
      <div
        className={cn(
          'w-full flex items-center gap-3 p-2 h-auto rounded-xl transition-all text-left justify-start group whitespace-normal relative',
          className
        )}
      >
        {/* Hover Background */}
        <div className="absolute inset-0 rounded-xl bg-foreground/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

        <Button
          variant="ghost"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClick()
          }}
          className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-muted z-20 hover:opacity-90 transition-opacity cursor-pointer text-left p-0 hover:bg-transparent"
          aria-label={artworkAriaLabel ?? title}
        >
          <img
            src={getDiscoveryArtworkUrl(artworkUrl, 100)}
            alt=""
            className="w-full h-full object-cover"
          />
        </Button>

        <div className="flex-1 min-w-0 z-20">
          {extraSubtitle && (
            <div className="text-xxs uppercase tracking-wider text-muted-foreground/80 font-bold mb-0.5 pointer-events-none">
              {extraSubtitle}
            </div>
          )}
          <div className="mb-0.5 z-20 relative">
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

        {RightIcon && (
          <div className="flex-shrink-0 ml-auto mr-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <RightIcon className="w-4 h-4 text-muted-foreground/60" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'w-full flex items-center gap-3 p-2 rounded-xl transition-all text-left justify-start group whitespace-normal relative',
        className
      )}
    >
      {/* Hover Background Overlay */}
      <div className="absolute inset-0 rounded-xl bg-foreground/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Left: Thumbnail/Icon with Play Overlay */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative w-12 h-12 flex-shrink-0 group/artwork p-0 overflow-hidden rounded-lg bg-muted z-20"
        onClick={(event) => {
          event.stopPropagation()
          onArtworkClick(event)
        }}
        aria-label={artworkAriaLabel ?? title}
      >
        <img
          src={getDiscoveryArtworkUrl(artworkUrl, 100)}
          alt=""
          className="w-full h-full object-cover transition-transform group-hover:scale-110"
        />

        {/* Improved Play Overlay: Use foreground/20 and backdrop blur */}
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 bg-background/90 text-primary rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm transform translate-y-1 group-hover:translate-y-0 transition-transform">
            <Play size={14} className="fill-current ml-0.5" />
          </div>
        </div>
      </Button>

      <div className="flex-1 min-w-0 z-20 relative">
        {/* Middle: Content */}
        <div className="flex flex-col flex-1 min-w-0">
          {extraSubtitle && (
            <div className="text-xxs uppercase tracking-wider text-muted-foreground/80 font-bold mb-0.5 pointer-events-none">
              {extraSubtitle}
            </div>
          )}
          <div className="mb-0.5 z-20 relative">
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

      {/* Right: Status/Icon */}
      {RightIcon && (
        <div className="flex-shrink-0 ml-auto mr-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <RightIcon className="w-4 h-4 text-muted-foreground/60" />
        </div>
      )}
    </div>
  )
}
