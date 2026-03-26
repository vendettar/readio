import { create } from 'zustand'
import type { FileFolder, FileSubtitle, FileTrack } from '../lib/dexieDb'
import { logError } from '../lib/logger'
import { FilesRepository } from '../lib/repositories/FilesRepository'
import { abortRequestsWithPrefix, deduplicatedFetchWithCallerAbort } from '../lib/requestManager'

function buildUpdateDedupeKey(
  prefix: string,
  id: string,
  updates: Record<string, unknown>
): string {
  const normalizedUpdates = Object.fromEntries(
    Object.entries(updates).sort(([a], [b]) => a.localeCompare(b))
  )
  return `${prefix}:${id}:${JSON.stringify(normalizedUpdates)}`
}

/** Test-only helper to reset module-scoped in-flight state between specs. */
export function __testOnlyResetFilesStoreFlags(): void {
  abortRequestsWithPrefix('updateFolder:')
  abortRequestsWithPrefix('updateFileTrack:')
  abortRequestsWithPrefix('deleteFileTrack:')
  abortRequestsWithPrefix('deleteFileSubtitle:')
  abortRequestsWithPrefix('loadFolders')
}

interface FilesState {
  folders: FileFolder[]
  tracks: FileTrack[]
  isLoading: boolean

  // Read Actions
  loadFolders: () => Promise<void>
  loadAllFolders: (signal?: AbortSignal) => Promise<FileFolder[]>
  loadAllTracks: (signal?: AbortSignal) => Promise<FileTrack[]>
  loadTracksForFolder: (folderId: string, signal?: AbortSignal) => Promise<void>
  getFolder: (folderId: string, signal?: AbortSignal) => Promise<FileFolder | null>
  getAudioBlob: (blobId: string, signal?: AbortSignal) => Promise<Blob | null>
  getSetting: (key: string, signal?: AbortSignal) => Promise<string | null>
  setSetting: (key: string, value: string, signal?: AbortSignal) => Promise<void>
  getFileSubtitlesForTrack: (trackId: string, signal?: AbortSignal) => Promise<FileSubtitle[]>

  // Write Actions for Folders
  updateFolder: (
    id: string,
    updates: Partial<Pick<FileFolder, 'name' | 'pinnedAt'>>,
    signal?: AbortSignal
  ) => Promise<void>

  // Write Actions for Tracks
  updateFileTrack: (id: string, updates: Partial<FileTrack>, signal?: AbortSignal) => Promise<void>
  deleteFileTrack: (id: string, signal?: AbortSignal) => Promise<void>

  // Write Actions for Subtitles
  deleteFileSubtitle: (id: string, signal?: AbortSignal) => Promise<void>
}

export const useFilesStore = create<FilesState>((set) => ({
  folders: [],
  tracks: [],
  isLoading: true,

  loadFolders: async () => {
    return deduplicatedFetchWithCallerAbort('loadFolders', undefined, async () => {
      try {
        const folders = await FilesRepository.getAllFolders()
        set({ folders, isLoading: false })
      } catch (err) {
        logError('[FilesStore] Failed to load folders:', err)
        set({ isLoading: false })
      }
    })
  },

  loadAllFolders: async (signal) => {
    try {
      const folders = await FilesRepository.getAllFolders()
      if (signal?.aborted) return []
      return folders
    } catch (err) {
      logError('[FilesStore] Failed to load all folders:', err)
      return []
    }
  },

  loadAllTracks: async (signal) => {
    try {
      const tracks = await FilesRepository.getAllFileTracks()
      if (signal?.aborted) return []
      return tracks
    } catch (err) {
      logError('[FilesStore] Failed to load all tracks:', err)
      return []
    }
  },

  loadTracksForFolder: async (folderId: string, signal) => {
    try {
      const tracks = await FilesRepository.getFileTracksInFolder(folderId)
      if (signal?.aborted) return
      set({ tracks })
    } catch (err) {
      if (signal?.aborted) return
      logError('[FilesStore] Failed to load tracks for folder:', err)
      throw err
    }
  },

  getFolder: async (folderId: string): Promise<FileFolder | null> => {
    try {
      const folder = await FilesRepository.getFolder(folderId)
      return folder || null
    } catch (err) {
      logError('[FilesStore] Failed to get folder:', err)
      return null
    }
  },

  getAudioBlob: async (blobId: string): Promise<Blob | null> => {
    try {
      const audioBlob = await FilesRepository.getAudioBlob(blobId)
      return audioBlob?.blob || null
    } catch (err) {
      logError('[FilesStore] Failed to get audio blob:', err)
      return null
    }
  },

  getSetting: async (key: string): Promise<string | null> => {
    try {
      const setting = await FilesRepository.getSetting(key)
      return setting || null
    } catch (err) {
      logError('[FilesStore] Failed to get setting:', err)
      return null
    }
  },

  setSetting: async (key: string, value: string): Promise<void> => {
    try {
      await FilesRepository.setSetting(key, value)
    } catch (err) {
      logError('[FilesStore] Failed to set setting:', err)
      throw err
    }
  },

  getFileSubtitlesForTrack: async (trackId: string, signal): Promise<FileSubtitle[]> => {
    try {
      const subs = await FilesRepository.getFileSubtitlesForTrack(trackId)
      if (signal?.aborted) return []
      return subs
    } catch (err) {
      logError('[FilesStore] Failed to get subtitles for track:', err)
      return []
    }
  },

  updateFolder: async (
    id: string,
    updates: Partial<Pick<FileFolder, 'name' | 'pinnedAt'>>,
    signal
  ): Promise<void> => {
    const dedupeKey = buildUpdateDedupeKey('updateFolder', id, updates)
    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        await FilesRepository.updateFolder(id, updates)
      } catch (err) {
        if (sharedSignal.aborted) return
        logError('[FilesStore] Failed to update folder:', err)
        throw err
      }
    })
  },

  updateFileTrack: async (id: string, updates: Partial<FileTrack>, signal): Promise<void> => {
    const dedupeKey = buildUpdateDedupeKey('updateFileTrack', id, updates)
    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        await FilesRepository.updateFileTrack(id, updates)
      } catch (err) {
        if (sharedSignal.aborted) return
        logError('[FilesStore] Failed to update track:', err)
        throw err
      }
    })
  },

  deleteFileTrack: async (id: string, signal): Promise<void> => {
    const dedupeKey = `deleteFileTrack:${id}`
    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        await FilesRepository.deleteFileTrack(id)
      } catch (err) {
        if (sharedSignal.aborted) return
        logError('[FilesStore] Failed to delete track:', err)
        throw err
      }
    })
  },

  deleteFileSubtitle: async (id: string, signal): Promise<void> => {
    const dedupeKey = `deleteFileSubtitle:${id}`
    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        await FilesRepository.deleteFileSubtitle(id)
      } catch (err) {
        if (sharedSignal.aborted) return
        logError('[FilesStore] Failed to delete subtitle:', err)
        throw err
      }
    })
  },
}))
