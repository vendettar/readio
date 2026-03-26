import { EpisodeRowSkeleton } from './EpisodeRowSkeleton'

interface EpisodeListSkeletonProps {
  count?: number
  className?: string
  /** Localized loading label for accessibility. Required for route-level announcements. */
  label: string
  /**
   * Controls whether the loading state is announced to screen readers via `aria-live`.
   * Defaults to `true`. Set to `false` if a parent component already handles the announcement.
   */
  announce?: boolean
}

export function EpisodeListSkeleton({
  count = 6,
  className,
  label,
  announce = true,
}: EpisodeListSkeletonProps) {
  return (
    <output
      className={className}
      aria-busy="true"
      aria-live={announce ? 'polite' : 'off'}
      aria-label={label}
    >
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton list
        <EpisodeRowSkeleton key={`episode-skeleton-${i}`} />
      ))}
    </output>
  )
}
