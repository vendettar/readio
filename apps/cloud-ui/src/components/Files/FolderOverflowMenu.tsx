// src/components/Files/FolderOverflowMenu.tsx

import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { useRef } from 'react'
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
import {
  useNestedOverflowMenu,
  useOverflowMenuAsyncAction,
  useOverflowMenuDeferredAction,
  useOverflowMenuStepFocus,
} from '../ui/useNestedOverflowMenu'

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
  const renameAction = useOverflowMenuDeferredAction(onRename)

  // Refs for focus management
  const deleteItemRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const { closeMenu, handleOpenChange, isMenuOpen, menuContentRef, setStep, step, triggerRef } =
    useNestedOverflowMenu<'menu' | 'confirm'>({
      initialStep: 'menu',
    })

  const handleMenuOpenChange = (open: boolean) => {
    handleOpenChange(open)
    onOpenChange?.(open)
  }

  const { isPending: isDeleting, run: runDelete } = useOverflowMenuAsyncAction({
    action: onDelete,
    isMenuOpen,
    onSuccess: () => {
      closeMenu()
      onOpenChange?.(false)
    },
  })

  useOverflowMenuStepFocus({
    initialStep: 'menu',
    isMenuOpen,
    step,
    transitions: [
      {
        focusRef: cancelButtonRef,
        returnFocusRef: deleteItemRef,
        step: 'confirm',
      },
    ],
  })

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
        collisionPadding={16}
        className="w-56 p-0 rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={renameAction.handleCloseAutoFocus}
      >
        {/* Grid container - single cell overlay, both panels in same cell */}
        <div ref={menuContentRef} className="grid [grid-template-areas:'panel'] p-0 gap-0">
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
              className="justify-between"
              onSelect={(e) => {
                e.preventDefault()
                if (isPinned) {
                  onUnpin()
                } else {
                  onPin()
                }
                closeMenu()
                onOpenChange?.(false)
              }}
            >
              <span>{isPinned ? t('folderUnpin') : t('folderPinToTop')}</span>
              {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </DropdownMenuItem>

            <DropdownMenuItem
              className="justify-between"
              onSelect={(e) => {
                e.preventDefault()
                renameAction.deferAction(() => {
                  closeMenu()
                  onOpenChange?.(false)
                })
              }}
            >
              <span>{t('folderRename')}</span>
              <Pencil className="h-4 w-4" />
            </DropdownMenuItem>

            <DropdownMenuSeparator className="m-0" />

            <DropdownMenuItem
              ref={deleteItemRef}
              className="text-destructive focus:text-destructive focus:bg-destructive/10 justify-between"
              disabled={disabled}
              onSelect={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setStep('confirm')
              }}
            >
              <span>{t('folderDelete')}</span>
              <Trash2 className="h-4 w-4" />
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
                    await runDelete()
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
