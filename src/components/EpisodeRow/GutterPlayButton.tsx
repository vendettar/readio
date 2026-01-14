import { Play } from 'lucide-react'
import type React from 'react'
import { Button } from '../ui/button'

interface GutterPlayButtonProps {
  onPlay: (e: React.MouseEvent) => void
  ariaLabel: string
}

/**
 * GutterPlayButton: A play button that appears inline when an episode has no artwork.
 * Uses flex layout instead of absolute positioning to ensure it's never clipped by overflow.
 *
 * Must be placed inside a `group/episode` hover group for visibility toggle.
 */
export function GutterPlayButton({ onPlay, ariaLabel }: GutterPlayButtonProps) {
  return (
    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center opacity-0 group-hover/episode:opacity-100 transition-opacity duration-200 mr-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onPlay}
        className="w-6 h-6 hover:bg-transparent"
        aria-label={ariaLabel}
      >
        <Play size={12} className="text-primary fill-current ml-0.5" />
      </Button>
    </div>
  )
}
