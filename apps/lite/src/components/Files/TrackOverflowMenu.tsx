// src/components/Files/TrackOverflowMenu.tsx

import { ChevronLeft, Folder, Home, Inbox, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { FileFolder } from '../../lib/dexieDb'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

type Step = 'menu' | 'move' | 'confirm'

interface TrackOverflowMenuProps {
  folders: FileFolder[]
  currentFolderId: string | null | undefined
  onMove: (folderId: string | null) => void
  onRename: () => void
  onDeleteTrack: () => Promise<boolean>
  disabled?: boolean
}

export function TrackOverflowMenu({
  folders,
  currentFolderId,
  onMove,
  onRename,
  onDeleteTrack,
  disabled = false,
}: TrackOverflowMenuProps) {
  const { t } = useI18n()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // Track if we are closing because of a rename to prevent focus restoration conflict
  const isClosingForRenameRef = useRef(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [step, setStep] = useState<Step>('menu')

  // Refs for focus management
  const moveItemRef = useRef<HTMLDivElement>(null)
  const deleteItemRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const moveBackButtonRef = useRef<HTMLButtonElement>(null)
  const prevStepRef = useRef<Step>('menu')

  const handleMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open)
    if (!open) {
      setIsDeleting(false)
      setStep('menu')
      triggerRef.current?.focus()
    }
  }

  // Focus management via useLayoutEffect
  useLayoutEffect(() => {
    if (!isMenuOpen) {
      prevStepRef.current = 'menu'
      return
    }

    const prevStep = prevStepRef.current
    prevStepRef.current = step

    if (step === 'confirm' && prevStep !== 'confirm') {
      cancelButtonRef.current?.focus()
    } else if (step === 'move' && prevStep !== 'move') {
      moveBackButtonRef.current?.focus()
    } else if (step === 'menu' && prevStep !== 'menu') {
      // Return focus to appropriate item
      if (prevStep === 'confirm') {
        deleteItemRef.current?.focus()
      } else if (prevStep === 'move') {
        moveItemRef.current?.focus()
      }
    }
  }, [isMenuOpen, step])

  const handleMove = (folderId: string | null) => {
    onMove(folderId)
    setIsMenuOpen(false)
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={handleMenuOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          className="h-8 w-8 text-foreground/80 data-[state=open]:bg-muted data-[state=open]:text-foreground rounded-full transition-all"
          aria-label={t('ariaMoreActions')}
        >
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-52 p-0 rounded-xl shadow-2xl overflow-hidden"
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
        {/* Grid container - single cell overlay, all panels in same cell */}
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
                isClosingForRenameRef.current = true
                setIsMenuOpen(false)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              <span>{t('trackRename')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              ref={moveItemRef}
              className=""
              onSelect={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setStep('move')
              }}
            >
              <Inbox className="mr-2 h-4 w-4" />
              <span>{t('filesMoveToFolder')}</span>
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
              <span>{t('filesDeleteTrack')}</span>
            </DropdownMenuItem>
          </div>

          {/* Move Panel */}
          <div
            className={cn(
              '[grid-area:panel] overflow-hidden transition-all duration-150 ease-out',
              step === 'move'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-2 pointer-events-none h-0'
            )}
            inert={step !== 'move' ? true : undefined}
          >
            <div>
              {/* Back button - header area with distinct background */}
              <div className="px-1.5 py-1.5 bg-muted/40 border-b border-border">
                <Button
                  ref={moveBackButtonRef}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 px-2 text-muted-foreground hover:text-foreground hover:bg-background"
                  tabIndex={step === 'move' ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation()
                    setStep('menu')
                  }}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  <span className="text-xs font-medium">{t('commonBack')}</span>
                </Button>
              </div>

              {/* Folder list section */}
              <div className="p-0">
                {/* Root folder option - only show if track is in a folder */}
                {currentFolderId != null && (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      handleMove(null)
                    }}
                  >
                    <Home className="mr-2 h-4 w-4" />
                    <span>{t('filesBackToRoot')}</span>
                  </DropdownMenuItem>
                )}

                {/* Folder list - exclude current folder */}
                {folders
                  .filter((folder) => folder.id !== currentFolderId)
                  .map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      className=""
                      onSelect={(e) => {
                        e.preventDefault()
                        handleMove(folder.id)
                      }}
                    >
                      <Folder className="mr-2 h-4 w-4" />
                      <span className="truncate">{folder.name}</span>
                    </DropdownMenuItem>
                  ))}

                {/* Show empty state only if no folders available to move to */}
                {folders.filter((folder) => folder.id !== currentFolderId).length === 0 &&
                  currentFolderId == null && (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                      {t('filesNoFolders')}
                    </div>
                  )}
              </div>
            </div>
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
              <div className="text-sm font-medium text-foreground">{t('trackDeleteTitle')}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t('trackDeleteDesc')}</div>

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
                    const ok = await onDeleteTrack()
                    if (ok) {
                      setIsMenuOpen(false)
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
