import { create } from 'zustand'
import type { PlaybackSession } from '../lib/dexieDb'
import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'
import { FilesRepository } from '../lib/repositories/FilesRepository'
import { PlaybackRepository } from '../lib/repositories/PlaybackRepository'
import { abortRequestsWithPrefix, deduplicatedFetchWithCallerAbort } from '../lib/requestManager'

/** Test-only helper to reset module-scoped in-flight state between specs. */
export function __testOnlyResetHistoryStoreFlags(): void {
  abortRequestsWithPrefix('deleteSession:')
  abortRequestsWithPrefix('loadSessions')
}

interface HistoryState {
  sessions: PlaybackSession[]
  artworkBlobs: Record<string, Blob>
  isLoading: boolean

  // Actions
  loadSessions: () => Promise<void>
  deleteSession: (id: string, signal?: AbortSignal) => Promise<void>
  resolveArtworkForSession: (session: PlaybackSession, signal?: AbortSignal) => Promise<void>
  getAudioBlobForSession: (audioId: string, signal?: AbortSignal) => Promise<Blob | null>
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  sessions: [],
  artworkBlobs: {},
  isLoading: true,

  loadSessions: async () => {
    return deduplicatedFetchWithCallerAbort('loadSessions', undefined, async () => {
      try {
        const sessions = await PlaybackRepository.getAllPlaybackSessions()
        set({ sessions, isLoading: false })
      } catch (err) {
        if (!isAbortLikeError(err)) warn('[HistoryStore] Failed to load sessions:', err)
        set({ isLoading: false })
      }
    })
  },

  deleteSession: async (id: string, signal) => {
    const dedupeKey = `deleteSession:${id}`
    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        await PlaybackRepository.deletePlaybackSession(id)
        if (sharedSignal.aborted) return
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
        }))
      } catch (err) {
        if (sharedSignal.aborted) return
        if (!isAbortLikeError(err)) warn('[HistoryStore] Failed to delete session:', id, err)
        throw err
      }
    })
  },

  resolveArtworkForSession: async (session: PlaybackSession, signal) => {
    if (session.source !== 'local' || !session.localTrackId) return
    if (get().artworkBlobs[session.id]) return

    try {
      const blob = await FilesRepository.resolveTrackArtwork(session.localTrackId)
      if (signal?.aborted) return
      if (blob) {
        set((state) => ({
          artworkBlobs: {
            ...state.artworkBlobs,
            [session.id]: blob,
          },
        }))
      }
    } catch (err) {
      if (signal?.aborted) return
      if (!isAbortLikeError(err))
        warn('[HistoryStore] Failed to resolve artwork for session:', session.id, err)
    }
  },

  getAudioBlobForSession: async (audioId: string): Promise<Blob | null> => {
    try {
      const audioBlob = await PlaybackRepository.getAudioBlob(audioId)
      return audioBlob?.blob || null
    } catch (err) {
      if (!isAbortLikeError(err)) warn('[HistoryStore] Failed to get audio blob:', err)
      return null
    }
  },
}))
