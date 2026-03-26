import { SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TransportSkipButtonProps {
  direction: 'back' | 'forward'
  onClick: () => void
  ariaLabel: string
  disabled?: boolean
  className?: string
  iconSize?: number
  iconStrokeWidth?: number
  iconClassName?: string
  title?: string
}

export function TransportSkipButton({
  direction,
  onClick,
  ariaLabel,
  disabled = false,
  className,
  iconSize = 16,
  iconStrokeWidth,
  iconClassName,
  title,
}: TransportSkipButtonProps) {
  const Icon = direction === 'back' ? SkipBack : SkipForward

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      className={cn(className)}
      aria-label={ariaLabel}
      title={title}
    >
      <Icon
        size={iconSize}
        strokeWidth={iconStrokeWidth}
        fill="currentColor"
        className={cn('rtl:rotate-180', iconClassName)}
      />
    </Button>
  )
}
