import { Skeleton } from '../ui/skeleton'

export function EpisodeRowSkeleton() {
  return (
    <div className="relative flex items-center gap-4 py-3">
      {/* Artwork Skeleton */}
      <Skeleton className="h-20 w-20 rounded-lg flex-shrink-0" />

      <div className="flex-1 min-w-0 flex items-center justify-between">
        <div className="flex-1 min-w-0 pe-12 py-1">
          {/* Subtitle Skeleton */}
          <Skeleton className="h-3 w-24 mb-1.5" />

          {/* Title Skeleton */}
          <Skeleton className="h-4 w-3/4 mb-2" />

          {/* Description Skeleton */}
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>

        {/* Right Side Skeleton (Duration/Actions) */}
        <div className="flex items-center flex-shrink-0 gap-12">
          <Skeleton className="h-3 w-12" />
          <div className="flex gap-1">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="absolute bottom-0 start-0 end-4 h-px bg-border/30" />
    </div>
  )
}
