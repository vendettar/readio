// src/components/Files/FolderCard.tsx

import { useDroppable } from '@dnd-kit/core'
import { Folder, FolderOpen, Pin } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInlineRename } from '../../hooks/useInlineRename'
import type { FileFolder } from '../../lib/db/types'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { FolderOverflowMenu } from './FolderOverflowMenu'
import { RenameInput } from './RenameInput'
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

  // Flag to prevent navigation if the current click was used to confirm a rename
  const ignoreNextClickRef = useRef(false)

  const {
    isRenaming,
    value: renameValue,
    errorKind,
    inputRef,
    startRename,
    confirmRename,
    cancelRename,
    setValue: setRenameValue,
    handleKeyDown,
  } = useInlineRename({
    originalName: folder.name,
    existingNames: existingFolderNames,
    entityKind: 'folder',
    onCommit: onRename,
  })

  const handleStartRename = () => {
    startRename()
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
        confirmRename()
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
        'aspect-folder-card',
        isCompact ? 'p-2' : 'p-5',
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
        className="absolute inset-0 h-full w-full p-0 hover:bg-transparent"
      >
        <span className="sr-only">{folder.name}</span>
      </Button>

      {/* Pin indicator */}
      {isPinned && (
        <div
          className={cn(
            'absolute text-muted-foreground',
            isCompact ? 'top-1 start-1.5' : 'top-2 start-2'
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
          <div className="relative flex flex-col items-center w-full gap-2">
            <RenameInput
              value={renameValue}
              setValue={setRenameValue}
              errorKind={errorKind}
              conflictMessage={t('folderNameConflict')}
              inputRef={inputRef}
              onConfirm={() => confirmRename()}
              onCancel={cancelRename}
              onBlurConfirm={() => confirmRename(true)}
              onKeyDown={handleKeyDown}
              containerClassName="w-full"
              inputWrapperClassName="w-full"
              inputClassName="text-center h-7 text-sm px-2 w-full"
              actionsClassName="w-full justify-center"
              confirmButtonClassName="h-7 w-7"
              cancelButtonClassName="h-7 w-7"
            />
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
            'absolute top-1 end-1 transition-opacity',
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
