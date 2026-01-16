// src/hooks/useFilesData.ts
// Event-driven data loading hook with status tracking and request guard

import { useCallback, useEffect, useRef, useState } from 'react'
import { DB, type FileFolder, type FileSubtitle, type FileTrack } from '../lib/dexieDb'
import { logError } from '../lib/logger'

export type LoadStatus = 'idle' | 'loading' | 'success' | 'error'

interface FilesData {
  folders: FileFolder[]
  tracks: FileTrack[]
  subtitles: FileSubtitle[]
  currentFolder: FileFolder | undefined
  /** Map of audioId -> lastPlayedAt timestamp */
  lastPlayedMap: Record<string, number>
  /** Map of folderId -> track count */
  folderCounts: Record<number, number>
}

export interface UseFilesDataReturn extends FilesData {
  currentFolderId: number | null
  setCurrentFolderId: (id: number | null) => void
  status: LoadStatus
  error: Error | null
  loadData: () => Promise<void>
}

export function useFilesData(): UseFilesDataReturn {
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null)
  const [data, setData] = useState<FilesData>({
    folders: [],
    tracks: [],
    subtitles: [],
    currentFolder: undefined,
    lastPlayedMap: {},
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
      const folderId = currentFolderIdRef.current

      const foldersData = await DB.getAllFolders()

      // Check if this request is still valid
      if (thisRequestId !== requestIdRef.current) {
        return
      }

      const tracksData = await DB.getFileTracksInFolder(folderId)

      if (thisRequestId !== requestIdRef.current) {
        return
      }

      // Load subtitles for current tracks
      const allSubPromises = tracksData.map((t) =>
        t.id ? DB.getFileSubtitlesForTrack(t.id) : Promise.resolve([])
      )
      const subsArrays = await Promise.all(allSubPromises)

      if (thisRequestId !== requestIdRef.current) {
        return
      }

      let folder: FileFolder | undefined
      if (folderId !== null) {
        folder = await DB.getFolder(folderId)
      }

      if (thisRequestId !== requestIdRef.current) {
        return
      }

      // Build lastPlayedMap from sessions
      const lastPlayedMap: Record<string, number> = {}
      const sessions = await DB.getAllPlaybackSessions()
      for (const session of sessions) {
        if (session.audioId && session.lastPlayedAt) {
          // Keep the most recent play time for each audioId
          if (
            !lastPlayedMap[session.audioId] ||
            lastPlayedMap[session.audioId] < session.lastPlayedAt
          ) {
            lastPlayedMap[session.audioId] = session.lastPlayedAt
          }
        }
      }

      if (thisRequestId !== requestIdRef.current) {
        return
      }

      // Load folder counts only if at root (where folders are displayed)
      const folderCounts: Record<number, number> = {}
      if (folderId === null && foldersData.length > 0) {
        const countPromises = foldersData.map((f) =>
          f.id ? DB.getFileTracksCountInFolder(f.id) : Promise.resolve(0)
        )
        const counts = await Promise.all(countPromises)
        foldersData.forEach((f, i) => {
          if (f.id) folderCounts[f.id] = counts[i]
        })
      }

      if (thisRequestId !== requestIdRef.current) {
        return
      }

      setData({
        folders: foldersData,
        tracks: tracksData,
        subtitles: subsArrays.flat(),
        currentFolder: folder,
        lastPlayedMap,
        folderCounts,
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
  const handleSetCurrentFolderId = useCallback((id: number | null) => {
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
