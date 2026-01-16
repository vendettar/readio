import { Link } from '@tanstack/react-router'
import { Play } from 'lucide-react'
import React from 'react'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { Button } from '../ui/button'

interface InteractiveArtworkProps {
  src?: string
  alt?: string
  className?: string
  // Navigation props
  to?: string
  params?: Record<string, string>
  // Action props
  onPlay?: (e: React.MouseEvent) => void
  playLabel?: string
  hoverScale?: boolean
  playPosition?: 'center' | 'bottom-left'
  playButtonSize?: 'sm' | 'md' | 'lg'
  playIconSize?: number
  hoverGroup?: 'episode' | 'item' | 'session' | 'card'
  // Size variants if needed
  size?: 'sm' | 'md' | 'lg' | 'xl'
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>['referrerPolicy']
  fallbackSrc?: string
}

/**
 * A standardized component for playable artwork that prevents nested interactive elements.
 * - Entire container can be a link (if to/params provided)
 * - Play button is positioned absolutely and stops propagation
 * - Complies with A11y rules (no nested buttons/links)
 */
export function InteractiveArtwork({
  src,
  alt = '',
  className,
  to,
  params,
  onPlay,
  playLabel,
  hoverScale = false,
  playPosition = 'center',
  playButtonSize = 'md',
  playIconSize,
  hoverGroup,
  size = 'md',
  referrerPolicy = 'no-referrer',
  fallbackSrc,
}: InteractiveArtworkProps) {
  const { t } = useI18n()
  const [hasError, setHasError] = React.useState(false)
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
    xl: 'w-24 h-24',
  }

  const playIconSizeMap = {
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
  }

  const playButtonSizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }

  const hoverOpacityClassMap = {
    episode: 'group-hover/episode:opacity-100',
    item: 'group-hover/item:opacity-100',
    session: 'group-hover/session:opacity-100',
    card: 'group-hover/card:opacity-100',
  }

  const hoverScaleClassMap = {
    episode: 'group-hover/episode:scale-110',
    item: 'group-hover/item:scale-110',
    session: 'group-hover/session:scale-110',
    card: 'group-hover/card:scale-110',
  }

  const hoverOpacityClass = hoverGroup
    ? hoverOpacityClassMap[hoverGroup]
    : 'group-hover/artwork:opacity-100'
  const hoverScaleClass = hoverGroup
    ? hoverScaleClassMap[hoverGroup]
    : 'group-hover/artwork:scale-110'

  const overlayClassName = cn(
    'absolute inset-0 bg-foreground/20 opacity-0 transition-opacity duration-200 pointer-events-none',
    hoverOpacityClass,
    playPosition === 'center'
      ? 'flex items-center justify-center'
      : 'flex items-end justify-start p-2'
  )

  const resolvedPlayIconSize = playIconSize ?? playIconSizeMap[size]
  const artworkUrl = getDiscoveryArtworkUrl(!hasError ? src : fallbackSrc)

  return (
    <div
      className={cn(
        'relative group/artwork overflow-hidden rounded-lg bg-muted shadow-sm flex-shrink-0',
        sizeClasses[size],
        className
      )}
    >
      {/* 1. Navigation Layer (Base) */}
      {to && params ? (
        <Button
          asChild
          variant="ghost"
          className="p-0 h-auto hover:bg-transparent block w-full h-full"
        >
          <Link to={to as any} params={params as any} className="block w-full h-full">
            <img
              src={artworkUrl}
              alt={alt}
              referrerPolicy={referrerPolicy}
              onError={() => setHasError(true)}
              className={cn(
                'w-full h-full object-cover transition-transform duration-500',
                hoverScale && hoverScaleClass
              )}
            />
          </Link>
        </Button>
      ) : (
        <img
          src={artworkUrl}
          alt={alt}
          referrerPolicy={referrerPolicy}
          onError={() => setHasError(true)}
          className={cn(
            'w-full h-full object-cover transition-transform duration-500',
            hoverScale && hoverScaleClass
          )}
        />
      )}

      {/* 2. Play Button Layer (Absolute Overlay) */}
      {onPlay && (
        <div className={overlayClassName}>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onPlay(e)
            }}
            className={cn(
              'rounded-full bg-background/90 hover:bg-primary text-primary hover:text-primary-foreground shadow-lg backdrop-blur-sm flex items-center justify-center transition-colors pointer-events-auto',
              playButtonSizeClasses[playButtonSize]
            )}
            aria-label={playLabel || t('ariaPlayEpisode')}
          >
            <Play size={resolvedPlayIconSize} className="fill-current ml-0.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
