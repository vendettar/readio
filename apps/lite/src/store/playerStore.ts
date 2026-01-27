// src/store/playerStore.ts
import { create } from 'zustand'
import { DB } from '../lib/dexieDb'
import { log, logError } from '../lib/logger'
import { getAppConfig } from '../lib/runtimeConfig'
import { getJson, setJson } from '../lib/storage'
import type { subtitle } from '../lib/subtitles'
import { parseSrt } from '../lib/subtitles'
import { toast } from '../lib/toast'

// Episode metadata for session persistence
export interface EpisodeMetadata {
  description?: string
  podcastTitle?: string
  podcastFeedUrl?: string
  artworkUrl?: string
  publishedAt?: number
  duration?: number // In seconds
  episodeId?: string // Episode GUID/ID for navigation (v6)
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface PlayerState {
  // audio state
  audioLoaded: boolean
  audioUrl: string | null
  audioTitle: string
  coverArtUrl: string | Blob | null
  isPlaying: boolean
  progress: number
  duration: number
  volume: number // 0-1 range
  playbackRate: number // 0.5 - 4.0
  pendingSeek: number | null // When set, App should sync to audio element
  activeBlobUrls: string[] // Track blob URLs for cleanup

  // Session tracking for progress persistence
  sessionId: string | null
  localTrackId: string | null // For  file session lookup (UUID)

  // Episode metadata for History display
  episodeMetadata: EpisodeMetadata | null

  // subtitle state
  subtitles: subtitle[]
  subtitlesLoaded: boolean
  currentIndex: number

  // lifecycle status
  initializationStatus: 'idle' | 'restoring' | 'ready' | 'failed'
  status: PlayerStatus

  // Actions
  setProgress: (progress: number) => void
  setDuration: (duration: number) => void
  setCurrentIndex: (index: number) => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  setAudioUrl: (
    url: string | null,
    title?: string,
    coverArt?: string | Blob | null,
    metadata?: EpisodeMetadata | null
  ) => void
  setSubtitles: (subtitles: subtitle[]) => void
  setSessionId: (id: string | null) => void
  setFileTrackId: (id: string | null) => void
  setEpisodeMetadata: (metadata: EpisodeMetadata | null) => void
  seekTo: (time: number) => void // Unified seek entry point
  clearPendingSeek: () => void
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  reset: () => void
  setStatus: (status: PlayerStatus) => void
  setPlayerError: (message?: string) => void
  loadAudio: (file: File) => void
  loadAudioBlob: (
    blob: Blob,
    title: string,
    artwork?: string | Blob | null,
    sessionId?: string | null
  ) => Promise<void>
  loadSubtitles: (file: File) => Promise<void>
  updateProgress: (time: number) => void // Throttled progress update with DB persistence
  saveProgressNow: () => Promise<void> // Force immediate save (for unmount)
  restoreSession: () => Promise<void> // Encapsulated restoration logic
}

const initialState = {
  audioLoaded: false,
  audioUrl: null as string | null,
  audioTitle: '',
  coverArtUrl: null as string | Blob | null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.8, // Will be overwritten by persistence
  playbackRate: 1, // Default rate
  pendingSeek: null as number | null,
  sessionId: null as string | null,
  localTrackId: null as string | null,
  episodeMetadata: null as EpisodeMetadata | null,
  activeBlobUrls: [] as string[],
  subtitles: [] as subtitle[],
  subtitlesLoaded: false,
  currentIndex: -1,
  initializationStatus: 'idle' as const,
  status: 'idle' as PlayerStatus,
}

// Persistence keys
const STORAGE_KEY_VOLUME = 'readio_volume'
const STORAGE_KEY_RATE = 'readio_playback_rate'

// Helper to get initial volume
const getInitialVolume = (): number => {
  const stored = getJson<number>(STORAGE_KEY_VOLUME)
  if (typeof stored !== 'number' || Number.isNaN(stored)) return 0.8
  return Math.max(0, Math.min(1, stored))
}

// Helper to get initial playback rate
const getInitialRate = (): number => {
  const stored = getJson<number>(STORAGE_KEY_RATE)
  if (typeof stored !== 'number' || Number.isNaN(stored)) return 1
  return Math.max(0.1, Math.min(4, stored))
}

// Throttling state for progress persistence (module-level to avoid closure issues)
let lastProgressSaveTime = 0

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,
  volume: getInitialVolume(),
  playbackRate: getInitialRate(),

  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  setCurrentIndex: (index) => set({ currentIndex: index }),
  setVolume: (volume) => {
    const newVolume = Math.max(0, Math.min(1, volume))
    setJson(STORAGE_KEY_VOLUME, newVolume)
    set({ volume: newVolume })
  },
  setPlaybackRate: (rate) => {
    const newRate = Math.max(0.1, Math.min(4, rate))
    setJson(STORAGE_KEY_RATE, newRate)
    set({ playbackRate: newRate })
  },
  setAudioUrl: (url, title = '', coverArt = '', metadata = null) =>
    set((state) => {
      // CRITICAL: Revoke old blob URLs BEFORE setting new state
      state.activeBlobUrls.forEach((u) => {
        try {
          URL.revokeObjectURL(u)
        } catch {
          // Ignore
        }
      })

      const normalizedUrl = url || null

      // Also track if coverArt is a blob URL (for external URLs if any)
      const isAudioBlob = normalizedUrl ? normalizedUrl.startsWith('blob:') : false
      const isCoverBlob = typeof coverArt === 'string' && coverArt.startsWith('blob:')

      const newBlobUrls: string[] = []
      if (isAudioBlob && normalizedUrl) newBlobUrls.push(normalizedUrl)
      if (isCoverBlob && coverArt) newBlobUrls.push(coverArt as string)

      // For external URLs (podcast episodes), reset sessionId and progress
      // This prevents old session progress from being restored for new episodes
      const shouldResetSession =
        (!!normalizedUrl && !isAudioBlob && normalizedUrl !== state.audioUrl) || !normalizedUrl

      return {
        audioUrl: normalizedUrl,
        audioLoaded: !!normalizedUrl,
        audioTitle: title,
        coverArtUrl: coverArt,
        episodeMetadata: metadata, // Explicitly set (defaults to null for files)
        activeBlobUrls: newBlobUrls,
        status: normalizedUrl ? 'loading' : 'idle',
        isPlaying: !!normalizedUrl,
        // Reset session for external URLs to start fresh
        ...(shouldResetSession
          ? {
              sessionId: null,
              progress: 0,
              localTrackId: null,
              duration: normalizedUrl ? metadata?.duration || 0 : 0,
            }
          : {}),
        // Always update duration if provided in metadata
        ...(metadata?.duration ? { duration: metadata.duration } : {}),
        // CRITICAL FIX: Always clear subtitles when changing track
        subtitles: [],
        subtitlesLoaded: false,
        currentIndex: -1,
      }
    }),
  setSubtitles: (subtitles) => set({ subtitles, subtitlesLoaded: subtitles.length > 0 }),
  setSessionId: (id) => set({ sessionId: id }),
  setFileTrackId: (id) => set({ localTrackId: id }),
  setEpisodeMetadata: (metadata) => set({ episodeMetadata: metadata }),

  // Unified seek entry point: sets pendingSeek, App layer listens and syncs to audio element
  seekTo: (time) =>
    set((state) => {
      const clampedTime = Math.max(0, Math.min(time, state.duration || Infinity))
      return { pendingSeek: clampedTime, progress: clampedTime }
    }),
  clearPendingSeek: () => set({ pendingSeek: null }),

  play: () =>
    set((state) => {
      // Only play if we have a track and we are in an authorized state
      if (!state.audioUrl || (state.status !== 'paused' && state.status !== 'idle')) return {}
      return { isPlaying: true, status: 'playing' }
    }),
  pause: () =>
    set((state) => {
      // If we were loading or playing, pausing moves us to 'paused'
      if (state.status === 'playing' || state.status === 'loading') {
        return { isPlaying: false, status: 'paused' }
      }
      return { isPlaying: false }
    }),
  togglePlayPause: () =>
    set((state) => {
      if (state.isPlaying) {
        return { isPlaying: false, status: 'paused' }
      }
      if (state.audioUrl && (state.status === 'paused' || state.status === 'idle')) {
        return { isPlaying: true, status: 'playing' }
      }
      return {}
    }),
  setStatus: (status) => set({ status }),
  setPlayerError: (message) => {
    logError('[PlayerStore] Player Error:', message)
    set({ status: 'error', isPlaying: false })
  },

  reset: () => {
    set((state) => {
      state.activeBlobUrls.forEach((u) => {
        URL.revokeObjectURL(u)
      })
      return initialState
    })
  },

  loadAudio: async (file) => {
    const config = getAppConfig()
    const MAX_AUDIO_SIZE = config.MAX_AUDIO_SIZE_MB * 1024 * 1024
    const shouldCache = file.size <= MAX_AUDIO_SIZE

    // Create blob URL for immediate playback
    const url = URL.createObjectURL(file)

    if (!shouldCache) {
      const fileSize = (file.size / (1024 * 1024)).toFixed(0)
      toast.infoKey('largeFileNotCached', { size: fileSize })
    }

    // Save to IndexedDB in background (async, don't block UI)
    const saveToDb = async () => {
      try {
        let audioId: string | null = null

        if (shouldCache) {
          audioId = await DB.addAudioBlob(file, file.name)
        }

        // Link audio to current session
        const currentSessionId = usePlayerStore.getState().sessionId
        if (currentSessionId) {
          await DB.updatePlaybackSession(currentSessionId, {
            audioId,
            audioFilename: file.name,
            hasAudioBlob: shouldCache,
            sizeBytes: file.size, // Ensure total size is updated
          })
        }
      } catch (err) {
        logError('[PlayerStore] Failed to save audio to IndexedDB:', err)
      }
    }

    saveToDb()

    set((state) => {
      // CRITICAL: Revoke any existing local blob URLs inside the updater to prevent race conditions
      state.activeBlobUrls.forEach((u) => {
        try {
          URL.revokeObjectURL(u)
        } catch {
          // Ignore
        }
      })

      return {
        audioUrl: url,
        audioLoaded: true,
        audioTitle: file.name,
        coverArtUrl: null,
        activeBlobUrls: [url],
        status: 'loading',
        isPlaying: true,
        // Reset session for NEW manual upload
        sessionId: null,
        progress: 0,
        localTrackId: null,
        // Always clear subtitles when changing track
        subtitles: [],
        subtitlesLoaded: false,
        currentIndex: -1,
      }
    })
  },

  loadAudioBlob: async (blob, title, artwork, sessionId = null) => {
    const url = URL.createObjectURL(blob)
    const newBlobUrls = [url]

    set((state) => {
      // CRITICAL: Revoke any existing local blob URLs inside the updater to prevent race conditions
      state.activeBlobUrls.forEach((u) => {
        try {
          URL.revokeObjectURL(u)
        } catch {
          // Ignore
        }
      })

      return {
        audioUrl: url,
        audioLoaded: true,
        audioTitle: title,
        coverArtUrl: artwork || null,
        activeBlobUrls: newBlobUrls,
        status: 'loading',
        isPlaying: true,
        sessionId: sessionId || null,
        progress: 0,
        localTrackId: null,
        subtitles: [],
        subtitlesLoaded: false,
        currentIndex: -1,
      }
    })
  },

  loadSubtitles: async (file) => {
    const content = await file.text()
    const subtitles = parseSrt(content)

    // Save to IndexedDB in background
    const saveToDb = async () => {
      try {
        const subtitleId = await DB.addSubtitle(content, file.name)

        // Link subtitle to current session
        const currentSessionId = usePlayerStore.getState().sessionId
        if (currentSessionId) {
          await DB.updatePlaybackSession(currentSessionId, {
            subtitleId,
            subtitleFilename: file.name,
            subtitleType: file.name.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt',
          })
        }
      } catch (err) {
        logError('[PlayerStore] Failed to save subtitle to IndexedDB:', err)
      }
    }

    saveToDb()

    set({
      subtitles,
      subtitlesLoaded: true,
      currentIndex: -1, // Reset to avoid stale index from previous subtitles
    })
  },

  // Throttled progress update with DB persistence
  updateProgress: (time) => {
    const config = getAppConfig()

    // Always update the store state
    set({ progress: time })

    // Throttle DB writes
    const now = Date.now()
    if (now - lastProgressSaveTime < config.SAVE_PROGRESS_INTERVAL_MS) {
      return
    }
    lastProgressSaveTime = now

    // Save to DB in background
    const state = usePlayerStore.getState()
    if (!state.sessionId || time <= 0) return

    DB.updatePlaybackSession(state.sessionId, {
      progress: time,
      duration: state.duration || 0,
      // Only update timestamp if actively playing
      ...(state.isPlaying ? { lastPlayedAt: now } : {}),
    })
      .then(() => {
        log(`[PlayerStore] Saved progress: ${time.toFixed(1)}s`)
      })
      .catch((err) => {
        logError('[PlayerStore] Failed to save progress:', err)
      })
  },

  // Force immediate save (for unmount)
  saveProgressNow: async () => {
    const state = usePlayerStore.getState()
    if (!state.sessionId || state.progress <= 0) return

    try {
      await DB.updatePlaybackSession(state.sessionId, {
        progress: state.progress,
        duration: state.duration || 0,
        // Only update timestamp if actively playing
        ...(state.isPlaying ? { lastPlayedAt: Date.now() } : {}),
      })
    } catch (err) {
      logError('[PlayerStore] Failed to save progress on unmount:', err)
    }
  },

  // Encapsulated restoration logic
  restoreSession: async () => {
    const { initializationStatus } = usePlayerStore.getState()
    if (initializationStatus === 'restoring' || initializationStatus === 'ready') return

    set({ initializationStatus: 'restoring' })

    try {
      const lastSession = await DB.getLastPlaybackSession()
      if (!lastSession || lastSession.progress <= 0) {
        set({ initializationStatus: 'ready' })
        return
      }

      // 1. Prepare Metadata
      if (lastSession.duration) {
        set({ duration: lastSession.duration })
      }

      // 2. Restore audio file from IndexedDB
      if (lastSession.audioId) {
        const audioData = await DB.getAudioBlob(lastSession.audioId)
        if (audioData) {
          const file = new File([audioData.blob], audioData.filename, {
            type: audioData.type,
          })

          // Create blob URL for restored file
          const url = URL.createObjectURL(file)

          let artwork: string | Blob | null = null
          // If we have a local track ID, try to restore its artwork
          if (lastSession.localTrackId) {
            try {
              const track = await DB.getFileTrack(lastSession.localTrackId)
              if (track?.artworkId) {
                const artworkBlob = await DB.getAudioBlob(track.artworkId)
                if (artworkBlob) {
                  artwork = artworkBlob.blob
                }
              }
            } catch (err) {
              logError('[PlayerStore] Failed to restore artwork for local track', err)
            }
          }

          // Update state ATOMICALLY with the restored sessionId
          set((state) => {
            // CRITICAL: Revoke ANY existing blob URLs before setting new ones
            state.activeBlobUrls.forEach((u) => {
              try {
                URL.revokeObjectURL(u)
              } catch {
                // Ignore
              }
            })

            const newBlobUrls = [url]

            return {
              sessionId: lastSession.id,
              audioUrl: url,
              audioLoaded: true,
              audioTitle: file.name,
              coverArtUrl: artwork,
              activeBlobUrls: newBlobUrls,
              progress: lastSession.progress,
              status: 'paused',
              isPlaying: false,
            }
          })
        }
      }
      // 2b. Restore remote audio (Podcasts / Explore page)
      else if (lastSession.audioUrl) {
        log('[PlayerStore] Restoring remote podcast session:', lastSession.audioUrl)
        set({
          sessionId: lastSession.id,
          audioUrl: lastSession.audioUrl,
          audioLoaded: true,
          audioTitle: lastSession.title || '',
          progress: lastSession.progress,
          coverArtUrl: lastSession.artworkUrl || '',
          status: 'paused',
          isPlaying: false,
          episodeMetadata: {
            description: lastSession.description,
            podcastTitle: lastSession.podcastTitle,
            podcastFeedUrl: lastSession.podcastFeedUrl,
            artworkUrl: lastSession.artworkUrl,
            publishedAt: lastSession.publishedAt,
            episodeId: lastSession.episodeId,
          },
        })
      }

      // 3. Restore subtitle file from IndexedDB
      if (lastSession.subtitleId) {
        const subtitleData = await DB.getSubtitle(lastSession.subtitleId)
        if (subtitleData) {
          const content = subtitleData.content
          const subtitles = parseSrt(content)
          set({
            subtitles,
            subtitlesLoaded: true,
          })
        }
      }

      set({ initializationStatus: 'ready' })
    } catch (err) {
      logError('[PlayerStore] Session restoration failed:', err)
      set({ initializationStatus: 'failed' })
      // Keep it as failed so we can potentially retry or show error UI
    }
  },
}))
