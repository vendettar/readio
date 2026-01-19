// src/hooks/useFolderManagement.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { DB, type FileFolder } from '../lib/dexieDb'
import { logError } from '../lib/logger'
import { toast } from '../lib/toast'
import { useOnClickOutside } from './useOnClickOutside'

interface UseFolderManagementOptions {
  setCurrentFolderId: (id: string | null) => void
  onComplete: () => Promise<void>
  folders?: FileFolder[]
}

export function useFolderManagement({
  setCurrentFolderId,
  onComplete,
  folders = [],
}: UseFolderManagementOptions) {
  const [isNamingFolder, setIsNamingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const namingInputRef = useRef<HTMLInputElement>(null)

  // Focus input when naming starts
  useEffect(() => {
    if (isNamingFolder && namingInputRef.current) {
      namingInputRef.current.focus()
    }
  }, [isNamingFolder])

  // Click outside to cancel
  const namingContainerRef = useOnClickOutside<HTMLDivElement>(() => {
    setIsNamingFolder(false)
    setNewFolderName('')
  }, isNamingFolder)

  const handleCreateFolder = useCallback(() => {
    setCurrentFolderId(null)
    setIsNamingFolder(true)
  }, [setCurrentFolderId])

  const handleConfirmNewFolder = useCallback(async () => {
    const trimmed = newFolderName.trim()
    if (trimmed) {
      try {
        let finalName = trimmed
        let counter = 2

        // Case-insensitive check for existing names
        while (folders.some((f) => f.name.trim().toLowerCase() === finalName.toLowerCase())) {
          finalName = `${trimmed} (${counter})`
          counter++
        }

        await DB.addFolder(finalName)
        setNewFolderName('')
        setIsNamingFolder(false)
        await onComplete()
      } catch (err) {
        logError('[Files] Failed to create folder', err)
      }
    } else {
      setIsNamingFolder(false)
    }
  }, [newFolderName, folders, onComplete])

  const executeDeleteFolder = useCallback(
    async (folder: FileFolder): Promise<boolean> => {
      try {
        await DB.deleteFolder(folder.id)
        await onComplete()
        return true
      } catch (err) {
        logError('[Files] Failed to delete folder', err)
        toast.errorKey('folderDeleteFailed')
        return false
      }
    },
    [onComplete]
  )

  return {
    isNamingFolder,
    setIsNamingFolder,
    newFolderName,
    setNewFolderName,
    namingInputRef,
    namingContainerRef,
    handleCreateFolder,
    handleConfirmNewFolder,
    executeDeleteFolder,
  }
}
