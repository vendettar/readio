import { cn } from '../../lib/utils'
import { Skeleton } from '../ui/skeleton'

interface PodcastCardSkeletonProps {
  className?: string
  variant?: 'standard' | 'circular'
}

export function PodcastCardSkeleton({ className, variant = 'standard' }: PodcastCardSkeletonProps) {
  const radiusClass = variant === 'circular' ? 'rounded-full' : 'rounded-lg'

  return (
    <div className={cn('flex flex-col items-start w-full', className)}>
      <Skeleton className={cn('aspect-square w-full', radiusClass)} />
      <div
        className={cn('px-1 w-full mt-3', variant === 'circular' && 'flex flex-col items-center')}
      >
        <Skeleton className={cn('h-4 w-3/4 mb-1.5', variant === 'circular' && 'w-1/2')} />
        {variant !== 'circular' && <Skeleton className="h-3 w-1/2" />}
      </div>
    </div>
  )
}
