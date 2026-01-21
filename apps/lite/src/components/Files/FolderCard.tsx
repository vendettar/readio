// src/components/Files/FolderCard.tsx

import { useDroppable } from '@dnd-kit/core'
import { Check, Folder, FolderOpen, Pin, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileFolder } from '../../lib/dexieDb'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'
import { FolderOverflowMenu } from './FolderOverflowMenu'
import type { ViewDensity } from './types'

interface FolderCardProps {
  folder: FileFolder
  itemCount: number
  density?: ViewDensity
  onClick: () => void
  onPin: () => void
  onUnpin: () => void
  onRename: (newName: string) => void
  onDelete: () => Promise<boolean>
  isDropDisabled?: boolean
  isDragging?: boolean
  measureRef?: React.Ref<HTMLDivElement>
  existingFolderNames?: string[]
}

export function FolderCard({
  folder,
  itemCount,
  density = 'comfortable',
  onClick,
  onPin,
  onUnpin,
  onRename,
  onDelete,
  isDropDisabled = false,
  isDragging = false,
  measureRef,
  existingFolderNames = [],
}: FolderCardProps) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', id: folder.id },
    disabled: isDropDisabled,
  })

  const isPinned = typeof folder.pinnedAt === 'number'
  const isCompact = density === 'compact'

  // Menu open state (to keep button visible while menu is open)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(folder.name)
  const [renameError, setRenameError] = useState(false)
  const [conflictError, setConflictError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Flag to prevent navigation if the current click was used to confirm a rename
  const ignoreNextClickRef = useRef(false)

  const handleStartRename = () => {
    setRenameValue(folder.name)
    setRenameError(false)
    setConflictError(false)
    setIsRenaming(true)
  }

  const handleConfirmRename = (isBlur = false) => {
    const trimmed = renameValue.trim()

    // 1. Handle empty input
    if (!trimmed) {
      if (isBlur) {
        handleCancelRename()
      } else {
        setRenameError(true)
        inputRef.current?.focus()
      }
      return
    }

    // 2. Handle same as original
    if (trimmed === folder.name) {
      setIsRenaming(false)
      setRenameError(false)
      return
    }

    // 3. Handle conflict with other folders
    const isConflict = existingFolderNames.some(
      (name) =>
        name.trim().toLowerCase() === trimmed.toLowerCase() &&
        name.trim().toLowerCase() !== folder.name.trim().toLowerCase()
    )

    if (isConflict) {
      setConflictError(true)
      setRenameError(true)
      inputRef.current?.focus()
      return
    }

    // 4. Proceed with rename
    onRename(trimmed)
    setIsRenaming(false)
    setRenameError(false)
    setConflictError(false)
  }

  const handleCancelRename = () => {
    setIsRenaming(false)
    setRenameValue(folder.name)
    setRenameError(false)
    setConflictError(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirmRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelRename()
    }
  }

  // Handle card interaction
  const handleCardMouseDown = (e: React.MouseEvent) => {
    if (isDragging) return

    if (isRenaming) {
      // If clicking on the card but NOT on the input or its control buttons, confirm rename.
      // We use onMouseDown + e.preventDefault() to catch the click before onBlur fires.
      const target = e.target as HTMLElement
      const isInput = target.closest('input')
      const isOverlay = target.closest('[data-folder-overlay="true"]')
      const isButton = target.closest('button') && !isOverlay

      if (!isInput && !isButton) {
        e.preventDefault() // Keep focus in input (prevents blur timing issues)
        ignoreNextClickRef.current = true // Mark that this click chain is for confirmation
        handleConfirmRename()
      }
    }
  }

  const handleCardClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false
      return
    }
    if (isDragging || isRenaming) return
    onClick()
  }

  const [node, setNode] = useState<HTMLDivElement | null>(null)

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el)
      setNode(el)
    },
    [setNodeRef]
  )

  useEffect(() => {
    if (!measureRef) return
    if (typeof measureRef === 'function') {
      measureRef(node)
    } else if (measureRef && 'current' in measureRef) {
      const mutableRef = measureRef as React.MutableRefObject<HTMLDivElement | null>
      mutableRef.current = node
    }
  }, [measureRef, node])

  return (
    <div
      ref={setRefs}
      onMouseDown={handleCardMouseDown}
      data-droppable="true"
      className={cn(
        'folder-card group cursor-pointer flex flex-col items-center justify-center rounded-lg border-2 transition-colors duration-150 relative w-full overflow-hidden',
        // Keep the card rectangular by using aspect ratio that matches the content
        // and adjusting padding based on density
        'aspect-[1.5/1]',
        isCompact ? 'p-2 pt-3' : 'p-5 pt-7',
        isOver
          ? 'bg-primary/10 border-primary'
          : 'bg-transparent border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/20'
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={handleCardClick}
        aria-label={folder.name}
        data-folder-overlay="true"
        className="absolute inset-0 z-10 h-full w-full p-0 hover:bg-transparent"
      >
        <span className="sr-only">{folder.name}</span>
      </Button>

      {/* Pin indicator */}
      {isPinned && (
        <div
          className={cn(
            'absolute text-muted-foreground',
            isCompact ? 'top-1 left-1.5' : 'top-2 left-2'
          )}
        >
          <Pin size={12} className="rotate-45" />
        </div>
      )}

      <div
        className={cn(
          'rounded-lg flex items-center justify-center transition-colors',
          'w-10 h-10',
          isCompact ? 'mb-1' : 'mb-2',
          isOver
            ? 'bg-primary/20 text-primary'
            : 'bg-muted text-muted-foreground group-hover:text-foreground'
        )}
      >
        {isOver ? <FolderOpen size={20} /> : <Folder size={20} />}
      </div>

      {/* Folder name or rename input */}
      <div className="w-full px-2 text-center">
        {isRenaming ? (
          <div className="relative z-20 flex flex-col items-center w-full gap-2">
            <div className="relative w-full">
              <Popover open={conflictError}>
                <PopoverAnchor asChild>
                  <Input
                    ref={inputRef}
                    type="text"
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    value={renameValue}
                    onChange={(e) => {
                      setRenameValue(e.target.value)
                      setRenameError(false)
                      setConflictError(false)
                    }}
                    onKeyDown={handleKeyDown}
                    onBlur={() => handleConfirmRename(true)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'text-center h-7 text-sm px-2 w-full',
                      renameError && 'border-destructive focus-visible:ring-destructive'
                    )}
                  />
                </PopoverAnchor>
                <PopoverContent
                  side="top"
                  sideOffset={6}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="p-0 border-none bg-transparent shadow-none w-auto"
                >
                  <div className="relative bg-destructive text-destructive-foreground text-xs px-2 py-1.5 rounded-md shadow-lg whitespace-nowrap flex items-center gap-1.5 font-bold">
                    <X size={10} strokeWidth={3} />
                    <span>{t('folderNameConflict')}</span>
                    {/* Arrow */}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-destructive rotate-45" />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  handleConfirmRename()
                }}
                className="h-7 w-7"
              >
                <Check size={14} />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancelRename()
                }}
                className="h-7 w-7"
              >
                <X size={14} />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center min-w-0">
            <span className="font-medium text-foreground truncate w-full text-sm">
              {folder.name}
            </span>
            <span className={cn('text-muted-foreground text-xs', isCompact ? 'mt-0' : 'mt-1')}>
              {t('filesItemCount', { count: itemCount })}
            </span>
          </div>
        )}
      </div>

      {/* Context menu (hidden while dragging to avoid hover noise) */}
      {!isDragging && (
        <div
          className={cn(
            'absolute top-1 right-1 transition-opacity z-20',
            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <FolderOverflowMenu
            isPinned={isPinned}
            onPin={onPin}
            onUnpin={onUnpin}
            onRename={handleStartRename}
            onDelete={onDelete}
            onOpenChange={setIsMenuOpen}
            disabled={isRenaming}
          />
        </div>
      )}
    </div>
  )
}
