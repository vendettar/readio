// src/components/ui/overflow-menu.tsx
// Standardized overflow menu wrapper for consistent trigger and content styling

import { MoreHorizontal, MoreVertical } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './dropdown-menu'

export interface OverflowMenuProps {
  children: React.ReactNode
  triggerAriaLabel: string
  disabled?: boolean
  /** Icon orientation: 'horizontal' (default) or 'vertical' */
  iconOrientation?: 'horizontal' | 'vertical'
  /** Controlled open state */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Menu alignment: 'start' or 'end' (default) */
  align?: 'start' | 'end'
  /** Additional classes for trigger button */
  triggerClassName?: string
  /** Additional classes for content */
  contentClassName?: string
  /** Whether menu is modal (traps focus). Default: false for inline contexts */
  modal?: boolean
  /** Stop propagation on trigger click */
  stopPropagation?: boolean
  /** Side offset for content positioning */
  sideOffset?: number
  /** Callback to prevent focus restore on close */
  onCloseAutoFocus?: (e: Event) => void
}

export function OverflowMenu({
  children,
  triggerAriaLabel,
  disabled = false,
  iconOrientation = 'horizontal',
  open: controlledOpen,
  onOpenChange,
  align = 'end',
  triggerClassName,
  contentClassName,
  modal = false,
  stopPropagation = false,
  sideOffset = 8,
  onCloseAutoFocus,
}: OverflowMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen

  const handleOpenChange = (open: boolean) => {
    if (!isControlled) {
      setInternalOpen(open)
    }
    onOpenChange?.(open)
  }

  const Icon = iconOrientation === 'vertical' ? MoreVertical : MoreHorizontal

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange} modal={modal}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
          className={cn(
            'h-8 w-8 text-foreground/80',
            'data-[state=open]:bg-muted data-[state=open]:text-foreground data-[state=open]:opacity-100',
            triggerClassName
          )}
          aria-label={triggerAriaLabel}
        >
          <Icon size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align={align}
        sideOffset={sideOffset}
        className={cn('w-48', contentClassName)}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
