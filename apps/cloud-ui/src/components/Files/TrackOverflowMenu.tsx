// src/components/Files/TrackOverflowMenu.tsx

import {
  ChevronLeft,
  FileText,
  Folder,
  Home,
  Inbox,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileFolder } from '../../lib/db/types'
import { cn } from '../../lib/utils'
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

type Step = 'menu' | 'move' | 'confirm'

interface TrackOverflowMenuProps {
  folders: FileFolder[]
  currentFolderId: string | null | undefined
  onMove: (folderId: string | null) => void
  onTranscribe?: () => void
  isRetranscribe?: boolean
  onRename: () => void
  onDeleteTrack: () => Promise<boolean>
  disabled?: boolean
}

export function TrackOverflowMenu({
  folders,
  currentFolderId,
  onMove,
  onTranscribe,
  isRetranscribe = false,
  onRename,
  onDeleteTrack,
  disabled = false,
}: TrackOverflowMenuProps) {
  const { t } = useTranslation()
  const renameAction = useOverflowMenuDeferredAction(onRename)

  // Refs for focus management
  const moveItemRef = useRef<HTMLDivElement>(null)
  const deleteItemRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const moveBackButtonRef = useRef<HTMLButtonElement>(null)
  const { closeMenu, handleOpenChange, isMenuOpen, menuContentRef, setStep, step, triggerRef } =
    useNestedOverflowMenu<Step>({
      initialStep: 'menu',
    })

  const { isPending: isDeleting, run: runDeleteTrack } = useOverflowMenuAsyncAction({
    action: onDeleteTrack,
    isMenuOpen,
    onSuccess: closeMenu,
  })

  useOverflowMenuStepFocus({
    initialStep: 'menu',
    isMenuOpen,
    step,
    transitions: [
      {
        focusRef: moveBackButtonRef,
        returnFocusRef: moveItemRef,
        step: 'move',
      },
      {
        focusRef: cancelButtonRef,
        returnFocusRef: deleteItemRef,
        step: 'confirm',
      },
    ],
  })

  const handleMove = (folderId: string | null) => {
    onMove(folderId)
    closeMenu()
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={handleOpenChange} modal={false}>
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
        collisionPadding={16}
        className="w-52 p-0 rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={renameAction.handleCloseAutoFocus}
      >
        {/* Grid container - single cell overlay, all panels in same cell */}
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
                renameAction.deferAction(closeMenu)
              }}
            >
              <span>{t('trackRename')}</span>
              <Pencil className="h-4 w-4" />
            </DropdownMenuItem>
            <DropdownMenuItem
              ref={moveItemRef}
              className="justify-between"
              onSelect={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setStep('move')
              }}
            >
              <span>{t('filesMoveToFolder')}</span>
              <Inbox className="h-4 w-4" />
            </DropdownMenuItem>

            {onTranscribe && (
              <DropdownMenuItem
                className="justify-between"
                onSelect={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onTranscribe()
                  closeMenu()
                }}
              >
                <span>
                  {isRetranscribe ? t('asrRegenerateTranscript') : t('asrGenerateTranscript')}
                </span>
                <FileText className="h-4 w-4" />
              </DropdownMenuItem>
            )}

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
              <span>{t('filesDeleteTrack')}</span>
              <Trash2 className="h-4 w-4" />
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
                  <ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" />
                  <span className="text-xs font-medium">{t('commonBack')}</span>
                </Button>
              </div>

              {/* Folder list section */}
              <div className="p-0">
                {/* Root folder option - only show if track is in a folder */}
                {currentFolderId != null && (
                  <DropdownMenuItem
                    className="justify-between"
                    onSelect={(e) => {
                      e.preventDefault()
                      handleMove(null)
                    }}
                  >
                    <span>{t('filesBackToRoot')}</span>
                    <Home className="h-4 w-4" />
                  </DropdownMenuItem>
                )}

                {/* Folder list - exclude current folder */}
                {folders
                  .filter((folder) => folder.id !== currentFolderId)
                  .map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      className="justify-between"
                      onSelect={(e) => {
                        e.preventDefault()
                        handleMove(folder.id)
                      }}
                    >
                      <span className="truncate">{folder.name}</span>
                      <Folder className="h-4 w-4" />
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
                    await runDeleteTrack()
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
