// src/hooks/useFolderManagement.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileFolder } from '../lib/dexieDb'
import { createManagedFolder, deleteManagedFolder } from '../lib/folderManagementService'
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

  const [isLoading, setIsLoading] = useState(false)

  const handleConfirmNewFolder = useCallback(async () => {
    const trimmed = newFolderName.trim()
    if (!trimmed || isLoading) {
      if (!trimmed) setIsNamingFolder(false)
      return
    }

    setIsLoading(true)
    try {
      await createManagedFolder(trimmed, folders)
      setNewFolderName('')
      setIsNamingFolder(false)
      await onComplete()
    } catch (err) {
      logError('[Files] Failed to create folder', err)
    } finally {
      setIsLoading(false)
    }
  }, [newFolderName, folders, onComplete, isLoading])

  const executeDeleteFolder = useCallback(
    async (folder: FileFolder): Promise<boolean> => {
      try {
        await deleteManagedFolder(folder.id)
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
    isFolderLoading: isLoading,
  }
}
