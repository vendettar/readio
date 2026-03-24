import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PlaybackSpeedButtonProps {
  playbackRate: number
  onCycleRate: () => void
  disabled?: boolean
  ariaLabel: string
  className?: string
}

function formatPlaybackRate(playbackRate: number): string {
  return Number.isInteger(playbackRate) ? `${playbackRate}x` : `${playbackRate.toFixed(2)}x`
}

export function PlaybackSpeedButton({
  playbackRate,
  onCycleRate,
  disabled = false,
  ariaLabel,
  className,
}: PlaybackSpeedButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={onCycleRate}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(className)}
    >
      {formatPlaybackRate(playbackRate)}
    </Button>
  )
}
