import { Play } from 'lucide-react'
import type React from 'react'
import { Button } from '../ui/button'

interface GutterPlayButtonProps {
  onPlay: (e: React.MouseEvent) => void
  ariaLabel: string
}

/**
 * GutterPlayButton: A play button that appears in the gutter area when an episode has no artwork.
 * It uses absolute positioning to occupy the exact gutter width defined by --page-gutter-x.
 *
 * It centers the icon within that gutter space both horizontally and vertically.
 */
export function GutterPlayButton({ onPlay, ariaLabel }: GutterPlayButtonProps) {
  return (
    <div className="absolute -start-page-gutter top-0 bottom-0 w-page-gutter flex items-center justify-center opacity-0 group-hover/episode:opacity-100 group-focus-within/episode:opacity-100 transition-opacity duration-200 z-30">
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          onPlay(e)
        }}
        className="w-7 h-7 hover:bg-transparent flex items-center justify-center"
        aria-label={ariaLabel}
      >
        <Play size={14} className="text-primary fill-current ms-0.5" />
      </Button>
    </div>
  )
}
