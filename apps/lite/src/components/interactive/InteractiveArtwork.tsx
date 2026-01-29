import { Link } from '@tanstack/react-router'
// framer-motion removed
import { Play, Podcast } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

interface InteractiveArtworkProps {
  src?: string
  alt?: string
  className?: string
  // Navigation props
  to?: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  // Action props
  onPlay?: (e: React.MouseEvent) => void
  playLabel?: string
  hoverScale?: boolean
  playPosition?: 'center' | 'bottom-start'
  playButtonSize?: 'sm' | 'md' | 'lg' | 'xl'
  playIconSize?: number
  hoverGroup?: 'episode' | 'item' | 'session' | 'card'
  // Size variants if needed
  size?: 'sm' | 'md' | 'lg' | 'xl'
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>['referrerPolicy']
  fallbackSrc?: string
  blob?: Blob | null
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
  search,
  onPlay,
  playLabel,
  hoverScale = false,
  playPosition = 'center',
  playButtonSize,
  playIconSize,
  hoverGroup,
  size = 'md',
  referrerPolicy = 'no-referrer',
  fallbackSrc,
  blob,
}: InteractiveArtworkProps) {
  const { t } = useTranslation()
  const [hasError, setHasError] = React.useState(false)
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
    xl: 'w-24 h-24',
  }

  const staticPlayButtonSizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-14 h-14',
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

  const hoverOpacityClass = cn(
    hoverGroup && hoverOpacityClassMap[hoverGroup],
    'group-hover/artwork:opacity-100'
  )
  const hoverScaleClass = cn(
    hoverGroup && hoverScaleClassMap[hoverGroup],
    'group-hover/artwork:scale-110'
  )

  const overlayClassName = cn(
    'absolute inset-0 opacity-0 transition-opacity duration-200 pointer-events-none z-40',
    playPosition === 'center' && 'bg-foreground/20', // Only dim background for center play
    hoverOpacityClass,
    playPosition === 'center'
      ? 'flex items-center justify-center'
      : 'flex items-end justify-start p-3'
  )

  const resolvedPlayIconSize = playIconSize || 24

  const blobUrl = useImageObjectUrl(blob || null)
  const effectiveSrc = blobUrl || src
  const [isLoading, setIsLoading] = React.useState(!!(effectiveSrc || fallbackSrc))
  const [fallbackError, setFallbackError] = React.useState(false)

  // Reset loading state if source changes
  React.useEffect(() => {
    setIsLoading(!!(effectiveSrc || fallbackSrc))
    setHasError(false)
    setFallbackError(false)
  }, [effectiveSrc, fallbackSrc])

  const primaryUrl = effectiveSrc ? getDiscoveryArtworkUrl(effectiveSrc) : undefined
  const fallbackUrl = fallbackSrc ? getDiscoveryArtworkUrl(fallbackSrc) : undefined
  const useFallback = (hasError || !effectiveSrc) && !!fallbackUrl && !fallbackError
  const imageSrc = useFallback ? fallbackUrl : primaryUrl

  const renderImage = () => {
    if (!imageSrc) return null

    return (
      <img
        src={imageSrc}
        alt={alt}
        referrerPolicy={referrerPolicy}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          if (useFallback) {
            setFallbackError(true)
          } else {
            setHasError(true)
          }
        }}
        className={cn(
          'absolute inset-[-4px] w-[calc(100%+8px)] h-[calc(100%+8px)] max-w-none object-cover block transition-all duration-500',
          isLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
          hoverScale && !isLoading && hoverScaleClass
        )}
      />
    )
  }

  const renderPlaceholder = () => {
    if (!isLoading && imageSrc && !fallbackError && !(hasError && !fallbackUrl)) return null

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted/50 animate-in fade-in duration-300">
        {(!imageSrc || (hasError && !fallbackUrl) || fallbackError) && (
          <Podcast
            className="text-muted-foreground/40 transition-transform duration-300"
            size={size === 'sm' ? 20 : size === 'md' ? 24 : size === 'lg' ? 32 : 40}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative group/artwork overflow-hidden rounded-lg flex-shrink-0 bg-muted/30',
        sizeClasses[size],
        className
      )}
    >
      {/* 1. Image Layer */}
      {to && params ? (
        <Button
          asChild
          variant="ghost"
          className="p-0 h-auto hover:bg-transparent block w-full h-full relative z-10"
        >
          <Link
            to={to as any}
            params={params as any}
            search={search as any}
            className="block w-full h-full"
          >
            {renderImage()}
            {renderPlaceholder()}
          </Link>
        </Button>
      ) : (
        <div className="w-full h-full relative">
          {renderImage()}
          {renderPlaceholder()}
        </div>
      )}

      {/* Edge Artifact Sealer */}
      <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white pointer-events-none" />

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
              'rounded-full shadow-lg flex items-center justify-center transition-all duration-300 pointer-events-auto',
              // 1. Center Mode (Episode List): Solid Primary, Large, Scale Hover
              playPosition === 'center' && [
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'w-1/2 h-1/2 [&_svg]:w-1/2 [&_svg]:h-1/2',
              ],

              // 2. Corner Mode (Grid Card): Glassmorphism to match 3-dot menu
              playPosition !== 'center' && [
                'bg-background/60 backdrop-blur-md text-foreground', // Default glass
                'hover:bg-primary hover:text-primary-foreground', // Hover: Brand Accent Color
                playButtonSize
                  ? staticPlayButtonSizeClasses[playButtonSize]
                  : staticPlayButtonSizeClasses.sm,
                // Entrance Animation (matches PodcastCard menu)
                // Use the passed hoverGroup (e.g., 'card') to trigger animation from parent hover
                'translate-y-2 opacity-0 transition-all duration-300',
                hoverGroup
                  ? `group-hover/${hoverGroup}:translate-y-0 group-hover/${hoverGroup}:opacity-100`
                  : 'group-hover/artwork:translate-y-0 group-hover/artwork:opacity-100',
              ]
            )}
            aria-label={playLabel || t('ariaPlayEpisode')}
          >
            <Play size={resolvedPlayIconSize} className="fill-current ms-0.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
