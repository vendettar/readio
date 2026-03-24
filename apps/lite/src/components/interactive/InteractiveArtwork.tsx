import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Play, Podcast } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { resolveArtworkUrl } from '../../lib/imageUtils'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

interface InteractiveArtworkProps {
  src?: string
  alt?: string
  className?: string
  onClick?: (e: React.MouseEvent) => void
  // Navigation props
  to?: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  state?: Record<string, unknown>
  // Action props
  onPlay?: (e: React.MouseEvent) => void
  playLabel?: string
  hoverScale?: boolean
  playPosition?: 'center' | 'bottom-start'
  playButtonSize?: 'sm' | 'md' | 'lg' | 'xl'
  playButtonScale?: 'xxs' | 'xs' | 's' | 'l' | 'xl' | 'xxl'
  playIconSize?: number
  hoverGroup?: 'episode' | 'item' | 'session' | 'card'
  playControlVisibility?: 'hover' | 'hover-or-touch'
  // Size variants if needed
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'original'
  imageSize?: number
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>['referrerPolicy']
  fallbackSrc?: string
  blob?: Blob | null
  layoutId?: string
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
  state,
  onClick,
  onPlay,
  playLabel,
  hoverScale = false,
  playPosition = 'center',
  playButtonSize,
  playButtonScale = 's',
  playIconSize,
  hoverGroup,
  playControlVisibility = 'hover',
  size = 'md',
  imageSize,
  referrerPolicy = 'no-referrer',
  fallbackSrc,
  blob,
  layoutId,
}: InteractiveArtworkProps) {
  const { t } = useTranslation()
  const [hasError, setHasError] = React.useState(false)
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
    xl: 'w-24 h-24',
    original: '',
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

  const touchInputVisibleOverlayClass =
    playControlVisibility === 'hover-or-touch'
      ? '[@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100'
      : ''
  const touchInputVisibleCornerButtonClass =
    playControlVisibility === 'hover-or-touch'
      ? '[@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:translate-y-0 [@media(pointer:coarse)]:opacity-100'
      : ''
  const overlayClassName = cn(
    'absolute inset-0 transition-opacity duration-200 pointer-events-none',
    'opacity-0',
    touchInputVisibleOverlayClass,
    playPosition === 'center' && 'bg-foreground/20', // Only dim background for center play
    hoverOpacityClass,
    playPosition === 'center'
      ? 'flex items-center justify-center'
      : 'flex items-end justify-start p-3'
  )

  const resolvedPlayIconSize = playIconSize || 24
  const centerPlayButtonScaleClass = {
    xxs: 'w-[36%] h-[36%]',
    xs: 'w-[42%] h-[42%]',
    s: 'w-1/2 h-1/2',
    l: 'w-[58%] h-[58%]',
    xl: 'w-[66%] h-[66%]',
    xxl: 'w-[75%] h-[75%]',
  } as const

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

  const primaryUrl = effectiveSrc ? resolveArtworkUrl(effectiveSrc, size, imageSize) : undefined
  const fallbackUrl = fallbackSrc ? resolveArtworkUrl(fallbackSrc, size, imageSize) : undefined
  const useFallback = (hasError || !effectiveSrc) && !!fallbackUrl && !fallbackError
  const imageSrc = useFallback ? fallbackUrl : primaryUrl

  const renderImage = () => {
    if (!imageSrc) return null

    return (
      <motion.img
        layoutId={layoutId}
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
          'absolute inset-0 w-full h-full max-w-none object-cover block transition-all duration-500',
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
      {/* 1. Image Layer - Priority: onClick > (to && params) > Static div */}
      {/* Rule: onClick and Link are mutually exclusive to avoid double-behavior. */}
      {onClick ? (
        <Button
          variant="ghost"
          className="p-0 h-auto hover:bg-transparent block w-full h-full relative"
          onClick={onClick}
        >
          <div className="w-full h-full relative">
            {renderImage()}
            {renderPlaceholder()}
          </div>
        </Button>
      ) : to && params ? (
        <Button
          asChild
          variant="ghost"
          className="p-0 h-auto hover:bg-transparent block w-full h-full relative"
        >
          <Link
            to={to as never}
            params={params as never}
            search={search as never}
            state={state as never}
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
      <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-foreground/10 pointer-events-none" />

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
                centerPlayButtonScaleClass[playButtonScale],
                '[&_svg]:w-1/2 [&_svg]:h-1/2',
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
                touchInputVisibleCornerButtonClass,
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
