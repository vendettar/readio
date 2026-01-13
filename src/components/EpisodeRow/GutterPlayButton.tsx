import { Play } from 'lucide-react'
import type React from 'react'
import { Button } from '../ui/button'

interface GutterPlayButtonProps {
  onPlay: (e: React.MouseEvent) => void
  ariaLabel: string
}

/**
 * GutterPlayButton: A play button positioned in the left gutter area.
 * Used when an episode row has no artwork - the play button appears
 * in the left margin on hover.
 *
 * Must be placed inside a container with `position: relative` and
 * within a `group/episode` hover group.
 */
export function GutterPlayButton({ onPlay, ariaLabel }: GutterPlayButtonProps) {
  return (
    <div className="absolute left-0 top-0 bottom-0 -translate-x-full w-[var(--page-gutter-x)] flex items-center justify-center opacity-0 group-hover/episode:opacity-100 transition-opacity duration-200 z-20 pointer-events-none">
      <Button
        variant="ghost"
        size="icon"
        onClick={onPlay}
        className="w-6 h-6 pointer-events-auto hover:bg-transparent"
        aria-label={ariaLabel}
      >
        <Play size={12} className="text-primary fill-current ml-0.5" />
      </Button>
    </div>
  )
}
