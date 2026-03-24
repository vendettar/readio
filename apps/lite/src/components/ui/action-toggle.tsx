import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'

type ActionToggleSize = 'compact' | 'default'

export interface ActionToggleProps {
  active: boolean
  onToggle: () => void
  activeIcon: LucideIcon
  inactiveIcon: LucideIcon
  activeLabel?: string
  inactiveLabel?: string
  activeAriaLabel: string
  inactiveAriaLabel: string
  size?: ActionToggleSize
  className?: string
}

const SIZE_CLASSES: Record<
  ActionToggleSize,
  {
    button: string
    iconContainer: string
    activeIcon: string
    inactiveIcon: string
  }
> = {
  compact: {
    button: 'h-8 text-xs',
    iconContainer: 'w-4 h-4',
    activeIcon: 'w-4 h-4',
    inactiveIcon: 'w-4 h-4',
  },
  default: {
    button: 'h-8 text-xs',
    iconContainer: 'w-4 h-4',
    activeIcon: 'w-5 h-5',
    inactiveIcon: 'w-4 h-4',
  },
}

export function ActionToggle({
  active,
  onToggle,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
  activeLabel,
  inactiveLabel,
  activeAriaLabel,
  inactiveAriaLabel,
  size = 'default',
  className,
}: ActionToggleProps) {
  const sizeClass = SIZE_CLASSES[size]

  return (
    <Button
      variant="ghost"
      onClick={onToggle}
      className={cn(
        'rounded-full text-primary font-bold active:scale-95 bg-muted/70 hover:bg-muted transition-all duration-300 ease-out overflow-hidden',
        sizeClass.button,
        active ? 'w-8 p-0' : 'px-3',
        className
      )}
      aria-label={active ? activeAriaLabel : inactiveAriaLabel}
    >
      <div className={cn('flex items-center justify-center', active ? 'w-full h-full' : 'gap-1.5')}>
        <div
          className={cn(
            'relative flex items-center justify-center flex-shrink-0',
            sizeClass.iconContainer
          )}
        >
          <InactiveIcon
            className={cn(
              'stroke-2 absolute inset-0 m-auto transition-all duration-300',
              sizeClass.inactiveIcon,
              active ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'
            )}
          />
          <ActiveIcon
            strokeWidth={3}
            className={cn(
              'absolute inset-0 m-auto transition-all duration-300',
              sizeClass.activeIcon,
              active ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'
            )}
          />
        </div>
        {!active && inactiveLabel && <span className="whitespace-nowrap">{inactiveLabel}</span>}
        {active && activeLabel && <span className="whitespace-nowrap">{activeLabel}</span>}
      </div>
    </Button>
  )
}
