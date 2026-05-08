// src/hooks/useFilesData.ts
// Event-driven data loading hook with status tracking and request guard

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileFolder, FileSubtitle, FileTrack } from '../lib/dexieDb'
import { loadFilesDataSnapshot } from '../lib/filesDataService'
import { logError } from '../lib/logger'

export type LoadStatus = 'idle' | 'loading' | 'success' | 'error'

interface FilesData {
  folders: FileFolder[]
  tracks: FileTrack[]
  subtitles: FileSubtitle[]
  currentFolder: FileFolder | undefined
  /** Map of folderId -> track count */
  folderCounts: Record<string, number>
}

export interface UseFilesDataReturn extends FilesData {
  currentFolderId: string | null
  setCurrentFolderId: (id: string | null) => void
  status: LoadStatus
  error: Error | null
  loadData: () => Promise<void>
}

export function useFilesData(): UseFilesDataReturn {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [data, setData] = useState<FilesData>({
    folders: [],
    tracks: [],
    subtitles: [],
    currentFolder: undefined,
    folderCounts: {},
  })
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState<Error | null>(null)

  // Guard: request ID counter to prevent stale updates
  const requestIdRef = useRef(0)

  // Store currentFolderId in a ref for stable access in loadData
  const currentFolderIdRef = useRef(currentFolderId)
  useEffect(() => {
    currentFolderIdRef.current = currentFolderId
  }, [currentFolderId])

  const loadData = useCallback(async () => {
    // Increment request ID to invalidate any pending request
    requestIdRef.current += 1
    const thisRequestId = requestIdRef.current

    setStatus('loading')
    setError(null)

    try {
      const snapshot = await loadFilesDataSnapshot(currentFolderIdRef.current)

      if (thisRequestId !== requestIdRef.current) {
        return
      }

      setData({
        folders: snapshot.folders,
        tracks: snapshot.tracks,
        subtitles: snapshot.subtitles,
        currentFolder: snapshot.currentFolder,
        folderCounts: snapshot.folderCounts,
      })
      setStatus('success')
    } catch (err) {
      if (thisRequestId !== requestIdRef.current) {
        return
      }
      const error = err instanceof Error ? err : new Error(String(err))
      logError('[Files] Failed to load data:', error)
      setError(error)
      setStatus('error')
    }
  }, [])

  // Custom setCurrentFolderId that also triggers loadData
  const handleSetCurrentFolderId = useCallback((id: string | null) => {
    setCurrentFolderId(id)
  }, [])

  return {
    ...data,
    currentFolderId,
    setCurrentFolderId: handleSetCurrentFolderId,
    status,
    error,
    loadData,
  }
}
