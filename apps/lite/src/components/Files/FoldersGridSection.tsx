import { useNavigate } from '@tanstack/react-router'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileFolder } from '../../lib/db/types'
import { sortFolders } from '../../lib/files/sortFolders'
import { cn } from '../../lib/utils'
import { FolderCard } from './FolderCard'
import { NewFolderCard } from './NewFolderCard'
import type { ViewDensity } from './types'

interface FoldersGridSectionProps {
  folders: FileFolder[]
  folderCounts: Record<string, number>
  density: ViewDensity
  isNamingFolder: boolean
  newFolderName: string
  setNewFolderName: (value: string) => void
  namingInputRef: RefObject<HTMLInputElement | null>
  namingContainerRef: RefObject<HTMLDivElement | null>
  onConfirmNewFolder: () => void
  onCancelNamingFolder: () => void
  onPinFolder: (folderId: string) => Promise<void>
  onUnpinFolder: (folderId: string) => Promise<void>
  onRenameFolder: (folderId: string, newName: string) => Promise<void>
  onDeleteFolder: (folder: FileFolder) => Promise<boolean>
  isDragging: boolean
  hasActiveDragItem: boolean
}

export function FoldersGridSection({
  folders,
  folderCounts,
  density,
  isNamingFolder,
  newFolderName,
  setNewFolderName,
  namingInputRef,
  namingContainerRef,
  onConfirmNewFolder,
  onCancelNamingFolder,
  onPinFolder,
  onUnpinFolder,
  onRenameFolder,
  onDeleteFolder,
  isDragging,
  hasActiveDragItem,
}: FoldersGridSectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div>
      {(folders.length > 0 || isNamingFolder) && (
        <div className="mb-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            {t('filesFolders')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t('filesFolderHelperText')}</p>
        </div>
      )}

      <div
        className={cn(
          'grid gap-4',
          density === 'compact'
            ? 'grid-cols-3 md:grid-cols-5 lg:grid-cols-7'
            : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5'
        )}
      >
        {isNamingFolder && (
          <NewFolderCard
            value={newFolderName}
            onChange={setNewFolderName}
            onConfirm={onConfirmNewFolder}
            onCancel={onCancelNamingFolder}
            inputRef={namingInputRef}
            containerRef={namingContainerRef}
          />
        )}

        {sortFolders(folders).map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            itemCount={folderCounts[folder.id] || 0}
            density={density}
            isDragging={isDragging}
            onClick={() => {
              if (!folder.id) return
              void navigate({
                to: '/files/folder/$folderId',
                params: { folderId: String(folder.id) },
              })
            }}
            onPin={async () => {
              if (!folder.id) return
              await onPinFolder(folder.id)
            }}
            onUnpin={async () => {
              if (!folder.id) return
              await onUnpinFolder(folder.id)
            }}
            existingFolderNames={folders.map((f) => f.name)}
            onRename={async (newName) => {
              if (!folder.id) return
              await onRenameFolder(folder.id, newName)
            }}
            onDelete={() => onDeleteFolder(folder)}
            isDropDisabled={!hasActiveDragItem}
          />
        ))}
      </div>
    </div>
  )
}
