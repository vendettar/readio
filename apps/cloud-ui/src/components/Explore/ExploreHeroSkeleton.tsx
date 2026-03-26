import { Skeleton } from '../ui/skeleton'

export function ExploreHeroSkeleton() {
  return (
    <div className="w-full space-y-4">
      <Skeleton className="h-6 w-48 mb-6" /> {/* Section Title */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-60 min-w-52 space-y-3">
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <div className="space-y-2 px-1">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
