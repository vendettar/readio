// src/components/Files/FolderOverflowMenu.tsx

import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface FolderOverflowMenuProps {
  isPinned: boolean
  onPin: () => void
  onUnpin: () => void
  onRename: () => void
  onDelete: () => Promise<boolean>
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
}

export function FolderOverflowMenu({
  isPinned,
  onPin,
  onUnpin,
  onRename,
  onDelete,
  onOpenChange,
  disabled = false,
}: FolderOverflowMenuProps) {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // Track if we are closing because of a rename to prevent focus restoration conflict
  const isClosingForRenameRef = useRef(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [step, setStep] = useState<'menu' | 'confirm'>('menu')

  // Refs for focus management
  const deleteItemRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const prevStepRef = useRef<'menu' | 'confirm'>('menu')

  const handleMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open)
    onOpenChange?.(open)
    if (!open) {
      setIsDeleting(false)
      setStep('menu')
    }
  }

  // Focus management via useLayoutEffect (more stable than rAF)
  useLayoutEffect(() => {
    if (!isMenuOpen) {
      prevStepRef.current = 'menu'
      return
    }

    const prevStep = prevStepRef.current
    prevStepRef.current = step

    if (step === 'confirm' && prevStep !== 'confirm') {
      cancelButtonRef.current?.focus()
    } else if (step === 'menu' && prevStep === 'confirm') {
      deleteItemRef.current?.focus()
    }
  }, [isMenuOpen, step])

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={handleMenuOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'h-8 w-8 text-foreground/80 rounded-full transition-all',
            'data-[state=open]:bg-muted data-[state=open]:text-foreground'
          )}
          aria-label={t('ariaMoreActions')}
        >
          <MoreHorizontal size={15} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-56 p-0 rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          if (isClosingForRenameRef.current) {
            e.preventDefault()
            isClosingForRenameRef.current = false
            onRename()
          }
        }}
      >
        {/* Grid container - single cell overlay, both panels in same cell */}
        <div className="grid [grid-template-areas:'panel'] p-0 gap-0">
          {/* Menu Panel */}
          <div
            className={cn(
              '[grid-area:panel] overflow-hidden transition-all duration-150 ease-out',
              step === 'menu'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-2 pointer-events-none h-0'
            )}
            inert={step !== 'menu' ? true : undefined}
          >
            <DropdownMenuItem
              className=""
              onSelect={(e) => {
                e.preventDefault()
                if (isPinned) {
                  onUnpin()
                } else {
                  onPin()
                }
                handleMenuOpenChange(false)
              }}
            >
              {isPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
              <span>{isPinned ? t('folderUnpin') : t('folderPinToTop')}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className=""
              onSelect={(e) => {
                e.preventDefault()
                isClosingForRenameRef.current = true
                handleMenuOpenChange(false)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              <span>{t('folderRename')}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="m-0" />

            <DropdownMenuItem
              ref={deleteItemRef}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              disabled={disabled}
              onSelect={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsDeleting(false)
                setStep('confirm')
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>{t('folderDelete')}</span>
            </DropdownMenuItem>
          </div>

          {/* Confirm Panel */}
          <div
            className={cn(
              '[grid-area:panel] overflow-hidden transition-all duration-150 ease-out',
              step === 'confirm'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-2 pointer-events-none h-0'
            )}
            inert={step !== 'confirm' ? true : undefined}
          >
            <div className="p-4">
              <div className="text-sm font-medium text-foreground">{t('folderDeleteTitle')}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t('folderDeleteDesc')}</div>

              <div className="mt-3 flex justify-end gap-2">
                <Button
                  ref={cancelButtonRef}
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isDeleting}
                  tabIndex={step === 'confirm' ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation()
                    setStep('menu')
                  }}
                >
                  {t('commonCancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                  tabIndex={step === 'confirm' ? 0 : -1}
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (isDeleting) return
                    setIsDeleting(true)
                    const ok = await onDelete()
                    if (ok) {
                      handleMenuOpenChange(false)
                    } else {
                      setIsDeleting(false)
                    }
                  }}
                >
                  {t('commonDelete')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
