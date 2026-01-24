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
  /** Button variant for trigger */
  triggerVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  /** Button size for trigger */
  triggerSize?: 'default' | 'sm' | 'lg' | 'icon'
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
  /** Padding from viewport edges. Default: 16 */
  collisionPadding?: number
  /** Icon size. Default: 18 */
  iconSize?: number
  /** Custom icon component (overrides orientation) */
  icon?: React.ReactNode
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
  triggerVariant = 'ghost',
  triggerSize = 'icon',
  contentClassName,
  modal = false,
  stopPropagation = false,
  sideOffset = 8,
  onCloseAutoFocus,
  collisionPadding = 16,
  iconSize = 18,
  icon,
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

  const IconComp = iconOrientation === 'vertical' ? MoreVertical : MoreHorizontal

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange} modal={modal}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          disabled={disabled}
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
          className={cn(
            'h-8 w-8 text-foreground/80',
            'data-[state=open]:bg-muted data-[state=open]:text-foreground data-[state=open]:opacity-100',
            triggerClassName
          )}
          aria-label={triggerAriaLabel}
        >
          {icon ? icon : <IconComp size={iconSize} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn('min-w-48', contentClassName)}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
