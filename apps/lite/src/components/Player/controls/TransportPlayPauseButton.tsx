import { Loader2, Pause, Play } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TransportPlayPauseButtonProps {
  isPlaying: boolean
  isLoading: boolean
  onToggle: () => void
  ariaLabel: string
  disabled?: boolean
  variant?: ButtonProps['variant']
  className?: string
  iconSize?: number
  playClassName?: string
  loadingClassName?: string
}

export function TransportPlayPauseButton({
  isPlaying,
  isLoading,
  onToggle,
  ariaLabel,
  disabled = false,
  variant,
  className,
  iconSize = 20,
  playClassName,
  loadingClassName,
}: TransportPlayPauseButtonProps) {
  const computedDisabled = disabled || isLoading

  return (
    <Button
      variant={variant}
      size="icon"
      onClick={onToggle}
      disabled={computedDisabled}
      className={cn(className)}
      aria-label={ariaLabel}
    >
      {isLoading ? (
        <Loader2 size={iconSize} className={cn('animate-spin', loadingClassName)} />
      ) : isPlaying ? (
        <Pause size={iconSize} fill="currentColor" />
      ) : (
        <Play size={iconSize} fill="currentColor" className={cn(playClassName)} />
      )}
    </Button>
  )
}
