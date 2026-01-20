// src/store/playerStore.ts
import { create } from 'zustand'
import { DB } from '../lib/dexieDb'
import { translate } from '../lib/i18nUtils'
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

interface PlayerState {
  // audio state
  audioLoaded: boolean
  audioUrl: string
  audioTitle: string
  coverArtUrl: string
  isPlaying: boolean
  progress: number
  duration: number
  volume: number // 0-1 range
  playbackRate: number // 0.5 - 4.0
  pendingSeek: number | null // When set, App should sync to audio element
  currentBlobUrl: string | null // Track blob URLs for cleanup

  // Session tracking for progress persistence
  sessionId: string | null
  localTrackId: string | null // For  file session lookup (UUID)

  // Episode metadata for History display
  episodeMetadata: EpisodeMetadata | null

  // subtitle state
  subtitles: subtitle[]
  subtitlesLoaded: boolean
  currentIndex: number

  // Lifecycle status
  initializationStatus: 'idle' | 'restoring' | 'ready' | 'failed'

  // Actions
  setProgress: (progress: number) => void
  setDuration: (duration: number) => void
  setCurrentIndex: (index: number) => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  setAudioUrl: (
    url: string,
    title?: string,
    coverArt?: string,
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
  loadAudio: (file: File) => void
  loadSubtitles: (file: File) => Promise<void>
  updateProgress: (time: number) => void // Throttled progress update with DB persistence
  saveProgressNow: () => Promise<void> // Force immediate save (for unmount)
  restoreSession: () => Promise<void> // Encapsulated restoration logic
}

const initialState = {
  audioLoaded: false,
  audioUrl: '',
  audioTitle: '',
  coverArtUrl: '',
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.8, // Will be overwritten by persistence
  playbackRate: 1, // Default rate
  pendingSeek: null as number | null,
  sessionId: null as string | null,
  localTrackId: null as string | null,
  episodeMetadata: null as EpisodeMetadata | null,
  currentBlobUrl: null as string | null,
  subtitles: [] as subtitle[],
  subtitlesLoaded: false,
  currentIndex: -1,
  initializationStatus: 'idle' as const,
}

// Persistence keys
const STORAGE_KEY_VOLUME = 'readio_volume'
const STORAGE_KEY_RATE = 'readio_playback_rate'

// Helper to get initial volume
const getInitialVolume = (): number => {
  const stored = getJson<number>(STORAGE_KEY_VOLUME)
  return stored ?? 0.8
}

// Helper to get initial playback rate
const getInitialRate = (): number => {
  const stored = getJson<number>(STORAGE_KEY_RATE)
  return stored ?? 1
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
    setJson(STORAGE_KEY_RATE, rate)
    set({ playbackRate: rate })
  },
  setAudioUrl: (url, title = '', coverArt = '', metadata = null) =>
    set((state) => {
      // Revoke old blob URL if it's different
      if (state.currentBlobUrl && state.currentBlobUrl !== url) {
        URL.revokeObjectURL(state.currentBlobUrl)
      }

      // Also track if coverArt is a blob URL (future-proofing)
      const isAudioBlob = url.startsWith('blob:')
      const isCoverBlob = coverArt.startsWith('blob:')

      // For external URLs (podcast episodes), reset sessionId and progress
      // This prevents old session progress from being restored for new episodes
      const shouldResetSession = !isAudioBlob && url !== state.audioUrl

      return {
        audioUrl: url,
        audioLoaded: !!url,
        audioTitle: title,
        coverArtUrl: coverArt,
        episodeMetadata: metadata, // Explicitly set (defaults to null for files)
        currentBlobUrl: isAudioBlob ? url : isCoverBlob ? coverArt : null,
        // Reset session for external URLs to start fresh
        ...(shouldResetSession
          ? { sessionId: null, progress: 0, localTrackId: null, duration: metadata?.duration || 0 }
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

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),

  reset: () => {
    set((state) => {
      if (state.currentBlobUrl) {
        URL.revokeObjectURL(state.currentBlobUrl)
      }
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
      toast.info(translate('largeFileNotCached', { size: fileSize }))
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
      // Revoke old blob URL
      if (state.currentBlobUrl && state.currentBlobUrl !== url) {
        URL.revokeObjectURL(state.currentBlobUrl)
      }

      return {
        audioUrl: url,
        audioLoaded: true,
        audioTitle: file.name,
        coverArtUrl: '',
        currentBlobUrl: url,
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
      lastPlayedAt: now,
    })
      .then(() => {
        if (import.meta.env.DEV) {
          console.log(`[PlayerStore] Saved progress: ${time.toFixed(1)}s`)
        }
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
        lastPlayedAt: Date.now(),
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

          // Update state ATOMICALLY with the restored sessionId
          set((state) => {
            if (state.currentBlobUrl) URL.revokeObjectURL(state.currentBlobUrl)
            return {
              sessionId: lastSession.id,
              audioUrl: url,
              audioLoaded: true,
              audioTitle: file.name,
              currentBlobUrl: url,
              progress: lastSession.progress,
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
