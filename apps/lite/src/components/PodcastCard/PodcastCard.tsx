import { getDiscoveryArtworkUrl } from '@/lib/imageUtils'
import { cn } from '@/lib/utils'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'

interface PodcastCardProps {
  id: string
  title: string
  subtitle?: string
  artworkUrl: string
  rank?: number
  /** Optional click handler. If provided, used instead of Link */
  onClick?: () => void
  /** TanStack Router Link path. Defaults to /podcast/$id */
  to?: string
  /** TanStack Router Link params */
  params?: Record<string, string>
  /** TanStack Router Link search params */
  search?: Record<string, unknown>
  /** Class name for the outer container */
  className?: string
  /** Artwork size for Provider URL formatting (Apple). Defaults to 400. */
  imageSize?: number
  /** Whether the artwork should be rounded-full (as in TopChannelCard) */
  variant?: 'standard' | 'circular'
}

/**
 * A universal podcast card component used across Search, Subscriptions, and Explore.
 * Handles different data formats by providing a clean, consistent interface.
 */
export function PodcastCard({
  id,
  title,
  subtitle,
  artworkUrl,
  rank,
  onClick,
  to = '/podcast/$id',
  params = { id },
  search,
  className,
  imageSize = 400,
  variant = 'standard',
}: PodcastCardProps) {
  const containerClasses = cn(
    'group/card relative flex flex-col items-start text-start h-auto p-0 bg-transparent hover:bg-transparent shadow-none w-full',
    variant === 'circular' && 'items-center text-center',
    className
  )

  const radiusClass = variant === 'circular' ? 'rounded-full' : 'rounded-lg'

  return (
    <div className={containerClasses} data-testid="podcast-card">
      <div className={cn('relative aspect-square w-full', radiusClass)}>
        <InteractiveArtwork
          src={getDiscoveryArtworkUrl(artworkUrl, imageSize)}
          to={onClick ? undefined : to}
          params={onClick ? undefined : params}
          search={onClick ? undefined : search}
          hoverGroup="card"
          className={cn(
            'w-full h-full shadow-md group-hover/card:shadow-lg transition-all',
            radiusClass
          )}
        />

        {/* Rank Badge (Optional) */}
        {rank !== undefined && variant !== 'circular' && (
          <div className="absolute bottom-2 start-2 w-7 h-7 bg-background/80 text-foreground backdrop-blur-md rounded-lg flex items-center justify-center border border-border/50 group-hover/card:opacity-0 group-hover/card:invisible transition-all duration-300 pointer-events-none shadow-sm z-30">
            <span className="text-xs font-bold tabular-nums">{rank}</span>
          </div>
        )}
      </div>

      <div className={cn('px-1 w-full', variant === 'circular' ? 'mt-3' : 'mt-3')}>
        <div
          className={cn(
            'relative z-30',
            variant === 'circular' ? 'text-xs font-bold uppercase tracking-wider' : 'text-sm'
          )}
        >
          <InteractiveTitle
            title={`${variant === 'circular' && rank !== undefined ? `${rank}. ` : ''}${title}`}
            onClick={onClick}
            to={to}
            params={params}
            search={search}
            className={cn(
              'font-semibold',
              variant === 'circular' ? 'text-xs font-bold uppercase tracking-wider' : 'text-sm'
            )}
            buttonClassName="block"
            maxLines={1}
          />
        </div>
        {subtitle && (
          <p
            className={cn(
              'text-muted-foreground/80 line-clamp-1 mt-1 font-normal',
              variant === 'circular' ? 'hidden' : 'text-xs'
            )}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div
        className={cn(
          'absolute inset-0 z-0 opacity-0 group-hover/card:bg-accent/50 transition-colors pointer-events-none',
          radiusClass
        )}
      />
    </div>
  )
}
