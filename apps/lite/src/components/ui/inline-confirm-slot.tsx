import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface InlineConfirmSlotProps {
  active: boolean
  slotClassName?: string
  idlePanelClassName?: string
  confirmPanelClassName?: string
  idleContent: ReactNode
  confirmContent: ReactNode
}

export function InlineConfirmSlot({
  active,
  slotClassName,
  idlePanelClassName,
  confirmPanelClassName,
  idleContent,
  confirmContent,
}: InlineConfirmSlotProps) {
  return (
    <div className={cn('relative h-7', slotClassName)}>
      <div
        aria-hidden={active}
        inert={active ? true : undefined}
        className={cn(
          'absolute inset-0 flex items-center justify-end gap-1 transition-all duration-180 ease-out',
          active
            ? 'opacity-0 translate-y-1 scale-[0.98] pointer-events-none'
            : 'opacity-100 translate-y-0 scale-100',
          idlePanelClassName
        )}
      >
        {idleContent}
      </div>
      <div
        aria-hidden={!active}
        inert={!active ? true : undefined}
        className={cn(
          'absolute inset-0 flex items-center justify-end gap-1 transition-all duration-180 ease-out',
          active
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 -translate-y-1 scale-[0.98] pointer-events-none',
          confirmPanelClassName
        )}
      >
        {confirmContent}
      </div>
    </div>
  )
}
