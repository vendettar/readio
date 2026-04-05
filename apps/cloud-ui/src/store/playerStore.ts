import { create } from 'zustand'
import { isAbortLikeError } from '../lib/fetchUtils'
import { log, logError, warn } from '../lib/logger'
import { normalizePodcastAudioUrl } from '../lib/networking/urlUtils'
import type { PlaybackRequestMode } from '../lib/player/playbackMode'
import { __dropPlaybackSourceObjectUrl } from '../lib/player/playbackSource'
import { DownloadsRepository } from '../lib/repositories/DownloadsRepository'
import { FilesRepository } from '../lib/repositories/FilesRepository'
import { PlaybackRepository } from '../lib/repositories/PlaybackRepository'
import { getAppConfig } from '../lib/runtimeConfig'
import { getJson, setJson } from '../lib/storage'
import { parseSubtitles } from '../lib/subtitles'
import { usePlayerSurfaceStore } from './playerSurfaceStore'
import { useTranscriptStore } from './transcriptStore'

// Episode metadata for session persistence
export interface EpisodeMetadata {
  description?: string
  podcastTitle?: string
  podcastFeedUrl?: string
  countryAtSave?: string
  transcriptUrl?: string
  artworkUrl?: string
  publishedAt?: number
  durationSeconds?: number // In seconds
  episodeId?: string // Episode GUID/ID for navigation (v6)
  providerPodcastId?: string // Podcast ID for navigation (v6)
  providerEpisodeId?: string // Episode ID for deterministic history/favorites matching
  originalAudioUrl?: string // Network URL identity for offline playback
  playbackRequestMode?: PlaybackRequestMode // Request-scoped playback mode flag
}

export const PLAYER_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ERROR: 'error',
} as const
export type PlayerStatus = (typeof PLAYER_STATUS)[keyof typeof PLAYER_STATUS]

export const INITIALIZATION_STATUS = {
  IDLE: 'idle',
  RESTORING: 'restoring',
  READY: 'ready',
  FAILED: 'failed',
} as const
export type InitializationStatus =
  (typeof INITIALIZATION_STATUS)[keyof typeof INITIALIZATION_STATUS]

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
  autoplayAfterPendingSeek: boolean // Deferred autoplay used for resume-before-play flows
  activeBlobUrls: string[] // Track blob URLs for cleanup

  // Session tracking for progress persistence
  sessionId: string | null
  sessionPersistenceSuspended: boolean
  localTrackId: string | null // FK to `tracks.id` or `tracks.id` for association during ASR/persistence.

  // Episode metadata for History display
  episodeMetadata: EpisodeMetadata | null

  // lifecycle status
  initializationStatus: InitializationStatus
  status: PlayerStatus
  loadRequestId: number // Sequence ID to prevent race conditions

  // Actions
  setProgress: (progress: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  setAudioUrl: (
    url: string | null,
    title?: string,
    coverArt?: string | Blob | null,
    metadata?: EpisodeMetadata | null,
    isPlaying?: boolean
  ) => void

  setSessionId: (id: string | null) => void
  suspendSessionPersistence: () => void
  setPlaybackTrackId: (id: string | null) => void
  setEpisodeMetadata: (metadata: EpisodeMetadata | null) => void
  seekTo: (time: number) => void // Unified seek entry point
  clearPendingSeek: () => void
  queueAutoplayAfterPendingSeek: () => void
  clearAutoplayAfterPendingSeek: () => void
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  reset: () => void
  setStatus: (status: PlayerStatus) => void
  setPlayerError: (message?: string) => void
  loadAudio: (file: File, signal?: AbortSignal) => Promise<void>
  loadAudioBlob: (
    blob: Blob,
    title: string,
    artwork?: string | Blob | null,
    sessionId?: string | null,
    signal?: AbortSignal,
    metadata?: EpisodeMetadata | null
  ) => Promise<void>
  loadSubtitles: (file: File, signal?: AbortSignal) => Promise<void>
  updateProgress: (time: number) => void // Throttled progress update with DB persistence
  handleEndedPlayback: (endedProgress: number) => Promise<void> // Single-path ended handling
  saveProgressNow: (signal?: AbortSignal) => Promise<void> // Force immediate save (for unmount)
  restoreSession: (signal?: AbortSignal) => Promise<void> // Encapsulated restoration logic
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
  autoplayAfterPendingSeek: false,
  sessionId: null as string | null,
  sessionPersistenceSuspended: false,
  localTrackId: null as string | null,
  episodeMetadata: null as EpisodeMetadata | null,
  activeBlobUrls: [] as string[],

  initializationStatus: INITIALIZATION_STATUS.IDLE,
  status: PLAYER_STATUS.IDLE,
  loadRequestId: 0,
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

function isSessionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('Playback session') && error.message.includes('not found')
}

function revokeBlobUrl(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Ignore revocation errors
  } finally {
    __dropPlaybackSourceObjectUrl(url)
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...initialState,
  volume: getInitialVolume(),
  playbackRate: getInitialRate(),

  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
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
  setAudioUrl: (url, title = '', coverArt = '', metadata = null, isPlayingOverride?: boolean) => {
    const normalizedUrl = url || null
    const state = get()

    // Identity tracking
    const identityUrl = metadata?.originalAudioUrl || normalizedUrl
    const stateIdentityUrl = state.episodeMetadata?.originalAudioUrl || state.audioUrl

    const isSameTrack =
      !!identityUrl && identityUrl === stateIdentityUrl && state.status !== 'error'

    // Conditionals for same track but different URL (blob swap)
    const isSameTrackButDifferentUrl = isSameTrack && normalizedUrl !== state.audioUrl

    if (isSameTrack && normalizedUrl === state.audioUrl) {
      set({
        audioTitle: title,
        coverArtUrl: coverArt,
        episodeMetadata: metadata,
        audioLoaded: !!normalizedUrl,
        autoplayAfterPendingSeek: false,
        sessionPersistenceSuspended: false,
        ...(metadata?.durationSeconds ? { duration: metadata.durationSeconds } : {}),
      })
      return
    }

    if (isSameTrackButDifferentUrl) {
      state.activeBlobUrls.forEach((u) => {
        revokeBlobUrl(u)
      })
      const isAudioBlob = normalizedUrl ? normalizedUrl.startsWith('blob:') : false
      const isCoverBlob = typeof coverArt === 'string' && coverArt.startsWith('blob:')
      const newBlobUrls: string[] = []
      if (isAudioBlob && normalizedUrl) newBlobUrls.push(normalizedUrl)
      if (isCoverBlob && coverArt) newBlobUrls.push(coverArt as string)

      set({
        audioUrl: normalizedUrl,
        audioTitle: title,
        coverArtUrl: coverArt,
        episodeMetadata: metadata,
        audioLoaded: !!normalizedUrl,
        activeBlobUrls: newBlobUrls,
        autoplayAfterPendingSeek: false,
        sessionPersistenceSuspended: false,
        isPlaying:
          isPlayingOverride !== undefined ? isPlayingOverride : !!normalizedUrl && state.isPlaying,
        ...(metadata?.durationSeconds ? { duration: metadata.durationSeconds } : {}),
      })
      return
    }

    // New Track Implementation
    state.activeBlobUrls.forEach((u) => {
      revokeBlobUrl(u)
    })

    const isAudioBlob = normalizedUrl ? normalizedUrl.startsWith('blob:') : false
    const isCoverBlob = typeof coverArt === 'string' && coverArt.startsWith('blob:')

    const newBlobUrls: string[] = []
    if (isAudioBlob && normalizedUrl) newBlobUrls.push(normalizedUrl)
    if (isCoverBlob && coverArt) newBlobUrls.push(coverArt as string)

    const shouldResetSession = (!!identityUrl && identityUrl !== stateIdentityUrl) || !identityUrl

    set((state) => ({
      audioUrl: normalizedUrl,
      audioLoaded: !!normalizedUrl,
      audioTitle: title,
      coverArtUrl: coverArt,
      episodeMetadata: metadata,
      activeBlobUrls: newBlobUrls,
      autoplayAfterPendingSeek: false,
      status: normalizedUrl || title ? 'loading' : 'idle',
      isPlaying: isPlayingOverride !== undefined ? isPlayingOverride : !!normalizedUrl,
      ...(shouldResetSession
        ? {
            sessionId: null,
            sessionPersistenceSuspended: false,
            progress: 0,
            localTrackId: null,
            duration: normalizedUrl ? metadata?.durationSeconds || 0 : 0,
          }
        : { sessionPersistenceSuspended: false }),
      ...(metadata?.durationSeconds ? { duration: metadata.durationSeconds } : {}),
      loadRequestId: state.loadRequestId + 1,
    }))

    if (!isSameTrack) {
      useTranscriptStore.getState().resetTranscript()
    }
  },

  setSessionId: (id) => set({ sessionId: id }),
  suspendSessionPersistence: () => set({ sessionPersistenceSuspended: true, sessionId: null }),
  setPlaybackTrackId: (id) => set({ localTrackId: id }),
  setEpisodeMetadata: (metadata) => set({ episodeMetadata: metadata }),

  // Unified seek entry point: sets pendingSeek, App layer listens and syncs to audio element
  seekTo: (time) =>
    set((state) => {
      const clampedTime = Math.max(0, Math.min(time, state.duration || Infinity))
      return { pendingSeek: clampedTime, progress: clampedTime }
    }),
  clearPendingSeek: () => set({ pendingSeek: null }),
  queueAutoplayAfterPendingSeek: () => set({ autoplayAfterPendingSeek: true }),
  clearAutoplayAfterPendingSeek: () => set({ autoplayAfterPendingSeek: false }),

  play: () =>
    set((state) => {
      // Allow retry from error state by re-entering loading.
      if (!state.audioUrl) return {}
      if (state.status === 'paused' || state.status === 'idle') {
        return { isPlaying: true, status: 'playing' }
      }
      if (state.status === 'loading') {
        return { isPlaying: true }
      }
      if (state.status === 'error') {
        return { isPlaying: true, status: 'loading' }
      }
      return {}
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
      if (state.audioUrl && state.status === 'loading') {
        return { isPlaying: true }
      }
      if (state.audioUrl && state.status === 'error') {
        return { isPlaying: true, status: 'loading' }
      }
      return {}
    }),
  setStatus: (status) => set({ status }),
  setPlayerError: (message) => {
    if (message === 'NotAllowedError') {
      warn('[PlayerStore] Player autoplay blocked:', message)
      set({ status: 'paused', isPlaying: false })
    } else {
      logError('[PlayerStore] Player Error:', message)
      set({ status: 'error', isPlaying: false })
    }
  },

  reset: () => {
    set((state) => {
      state.activeBlobUrls.forEach((u) => {
        revokeBlobUrl(u)
      })
      return initialState
    })
    useTranscriptStore.getState().resetTranscript()
  },

  loadAudio: async (file, signal) => {
    // Create blob URL for immediate playback
    const url = URL.createObjectURL(file)

    // Save to IndexedDB in background (async, don't block UI)
    const saveToDb = async () => {
      try {
        // Enforce storage quota for manual uploads as well
        const { checkDownloadCapacity } = await import('../lib/downloadCapacity')
        const capacity = await checkDownloadCapacity(file.size)
        if (!capacity.allowed) {
          const { toast } = await import('../lib/toast')
          toast.errorKey('downloadStorageLimit')
          return
        }

        const audioId = await PlaybackRepository.addAudioBlob(file, file.name)

        // Link audio to current session
        const currentSessionId = usePlayerStore.getState().sessionId
        if (currentSessionId) {
          await PlaybackRepository.updatePlaybackSession(currentSessionId, {
            audioId,
            audioFilename: file.name,
            hasAudioBlob: true,
            sizeBytes: file.size, // Ensure total size is updated
          })
        }
      } catch (err) {
        if (!isAbortLikeError(err)) warn('[PlayerStore] Failed to save audio to IndexedDB:', err)
      }
    }
    void saveToDb()

    set((state) => {
      // CRITICAL: Revoke any existing local blob URLs inside the updater to prevent race conditions
      state.activeBlobUrls.forEach((u) => {
        revokeBlobUrl(u)
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
        loadRequestId: state.loadRequestId + 1,
      }
    })

    useTranscriptStore.getState().resetTranscript()
    if (signal?.aborted) return
  },

  loadAudioBlob: async (blob, title, artwork, sessionId = null, signal, metadata = null) => {
    const url = URL.createObjectURL(blob)
    const newBlobUrls = [url]
    const nextDurationSeconds =
      typeof metadata?.durationSeconds === 'number' && metadata.durationSeconds > 0
        ? metadata.durationSeconds
        : 0

    set((state) => {
      // CRITICAL: Revoke any existing local blob URLs inside the updater to prevent race conditions
      state.activeBlobUrls.forEach((u) => {
        revokeBlobUrl(u)
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
        duration: nextDurationSeconds,
        localTrackId: null,
        episodeMetadata: metadata,
        // Increment request ID to invalidate any pending async operations
        loadRequestId: state.loadRequestId + 1,
      }
    })

    useTranscriptStore.getState().resetTranscript()
    if (signal?.aborted) return
  },

  loadSubtitles: async (file, signal) => {
    const requestId = get().loadRequestId + 1
    set({ loadRequestId: requestId })

    const content = await file.text()
    if (get().loadRequestId !== requestId || signal?.aborted) return

    const subtitles = parseSubtitles(content)

    // Save to IndexedDB in background
    const saveToDb = async () => {
      try {
        const subtitleId = await PlaybackRepository.addSubtitle(subtitles, file.name)

        // Link subtitle to current session
        const currentSessionId = usePlayerStore.getState().sessionId
        if (currentSessionId) {
          await PlaybackRepository.updatePlaybackSession(currentSessionId, {
            subtitleId,
            subtitleFilename: file.name,
          })
        }
      } catch (err) {
        if (!isAbortLikeError(err)) warn('[PlayerStore] Failed to save subtitle to IndexedDB:', err)
      }
    }

    void saveToDb()

    const transcriptState = useTranscriptStore.getState()
    transcriptState.setSubtitles(subtitles)
    // Keep explicit reset here to avoid stale index if subtitle setter behavior changes.
    transcriptState.setCurrentIndex(-1)
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

    void PlaybackRepository.updatePlaybackSession(state.sessionId, {
      progress: time,
      durationSeconds: state.duration || 0,
      // Only update timestamp if actively playing
      ...(state.isPlaying ? { lastPlayedAt: now } : {}),
    })
      .then(() => {
        log(`[PlayerStore] Saved progress: ${time.toFixed(1)}s`)
      })
      .catch((err) => {
        if (isSessionNotFoundError(err)) {
          set({ sessionId: null, sessionPersistenceSuspended: true })
          return
        }
        if (!isAbortLikeError(err)) warn('[PlayerStore] Failed to save progress:', err)
      })
  },

  handleEndedPlayback: async (endedProgress) => {
    const state = usePlayerStore.getState()
    const clampedEndedProgress = Math.max(0, Math.min(endedProgress, state.duration || Infinity))

    set((current) => ({
      progress: clampedEndedProgress,
      isPlaying: false,
      status:
        current.status === PLAYER_STATUS.PLAYING || current.status === PLAYER_STATUS.LOADING
          ? PLAYER_STATUS.PAUSED
          : current.status,
    }))

    const postPauseState = usePlayerStore.getState()
    if (!postPauseState.sessionId) return

    try {
      await PlaybackRepository.updatePlaybackSession(postPauseState.sessionId, {
        progress: 0,
        durationSeconds: postPauseState.duration || 0,
      })
    } catch (err) {
      if (isSessionNotFoundError(err)) {
        set({ sessionId: null, sessionPersistenceSuspended: true })
        return
      }
      if (!isAbortLikeError(err))
        warn('[PlayerStore] Failed to persist ended playback completion:', err)
    }
  },

  // Force immediate save (for unmount)
  // NOTE: This is a "persistence side-effect" and should NOT update loadRequestId
  // to avoid accidentally canceling ongoing restore/load operations
  saveProgressNow: async (signal) => {
    const state = usePlayerStore.getState()
    if (!state.sessionId || state.progress <= 0 || signal?.aborted) return

    try {
      await PlaybackRepository.updatePlaybackSession(state.sessionId, {
        progress: state.progress,
        durationSeconds: state.duration || 0,
        // Only update timestamp if actively playing
        ...(state.isPlaying ? { lastPlayedAt: Date.now() } : {}),
      })
    } catch (err) {
      if (isSessionNotFoundError(err)) {
        set({ sessionId: null, sessionPersistenceSuspended: true })
        return
      }
      if (!isAbortLikeError(err)) warn('[PlayerStore] Failed to save progress on unmount:', err)
    }
  },

  // Encapsulated restoration logic
  restoreSession: async (signal) => {
    const { initializationStatus } = usePlayerStore.getState()
    if (initializationStatus === 'restoring' || initializationStatus === 'ready') return

    const requestId = get().loadRequestId + 1
    set({ initializationStatus: 'restoring', loadRequestId: requestId })

    try {
      const lastSession = await PlaybackRepository.getLastPlaybackSession()
      if (!lastSession || lastSession.progress <= 0) {
        if (get().loadRequestId !== requestId || signal?.aborted) return
        usePlayerSurfaceStore.getState().setPlayableContext(false)
        set({ initializationStatus: 'ready' })
        return
      }

      // 1. Prepare Metadata
      if (lastSession.durationSeconds) {
        set({ duration: lastSession.durationSeconds })
      }

      // 2. Restore audio file from IndexedDB
      if (lastSession.audioId) {
        const audioData = await PlaybackRepository.getAudioBlob(lastSession.audioId)
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
              artwork = await FilesRepository.resolveTrackArtwork(lastSession.localTrackId)
            } catch (err) {
              if (!isAbortLikeError(err))
                warn('[PlayerStore] Failed to restore artwork for local track', err)
            }
          }

          // Update state ATOMICALLY with the restored sessionId
          // Race Condition Guard: Check if a new request started while we were awaiting DB
          if (get().loadRequestId !== requestId || signal?.aborted) {
            // initializationStatus transition should be careful here
            // If it was cancelled by a NEW load, don't set ready
            if (get().loadRequestId === requestId) set({ initializationStatus: 'ready' })
            return
          }

          set((state) => {
            // CRITICAL: Revoke ANY existing blob URLs before setting new ones
            state.activeBlobUrls.forEach((u) => {
              revokeBlobUrl(u)
            })

            const newBlobUrls = [url]

            return {
              sessionId: lastSession.id,
              audioUrl: url,
              audioLoaded: true,
              audioTitle: file.name,
              coverArtUrl: artwork,
              activeBlobUrls: newBlobUrls,
              localTrackId: lastSession.localTrackId ?? null,
              progress: lastSession.progress,
              status: 'paused',
              isPlaying: false,
            }
          })
          useTranscriptStore.getState().resetTranscript()
          usePlayerSurfaceStore.getState().setPlayableContext(true)
        }
      }
      // 2b. Restore remote audio (Podcasts / Explore page)
      // Prefer local download if available before falling back to remote URL
      else if (lastSession.audioUrl) {
        if (get().loadRequestId !== requestId || signal?.aborted) {
          if (get().loadRequestId === requestId) set({ initializationStatus: 'ready' })
          return
        }

        const normalizedUrl = normalizePodcastAudioUrl(lastSession.audioUrl)
        const downloadedTrack = await DownloadsRepository.findTrackByUrl(normalizedUrl)

        if (downloadedTrack) {
          const audioData = await PlaybackRepository.getAudioBlob(downloadedTrack.audioId)
          if (audioData) {
            const restoredLocalTrackId = downloadedTrack.id
            log(
              '[PlayerStore] Restoring remote session from local download:',
              downloadedTrack.audioId
            )
            const file = new File([audioData.blob], audioData.filename, {
              type: audioData.type,
            })
            const url = URL.createObjectURL(file)

            let artwork: string | Blob | null = null
            if (restoredLocalTrackId) {
              try {
                artwork = await FilesRepository.resolveTrackArtwork(restoredLocalTrackId)
              } catch (err) {
                if (!isAbortLikeError(err))
                  warn('[PlayerStore] Failed to restore artwork for local track', err)
              }
            }

            if (get().loadRequestId !== requestId || signal?.aborted) {
              if (get().loadRequestId === requestId) set({ initializationStatus: 'ready' })
              return
            }

            set((state) => {
              state.activeBlobUrls.forEach((u) => {
                revokeBlobUrl(u)
              })

              return {
                sessionId: lastSession.id,
                audioUrl: url,
                audioLoaded: true,
                audioTitle: lastSession.title || '',
                coverArtUrl: artwork || lastSession.artworkUrl || '',
                activeBlobUrls: [url],
                localTrackId: restoredLocalTrackId,
                progress: lastSession.progress,
                status: 'paused',
                isPlaying: false,
                episodeMetadata: {
                  description: lastSession.description,
                  podcastTitle: lastSession.podcastTitle,
                  podcastFeedUrl: lastSession.podcastFeedUrl,
                  transcriptUrl: lastSession.transcriptUrl,
                  artworkUrl: lastSession.artworkUrl,
                  publishedAt: lastSession.publishedAt,
                  episodeId: lastSession.episodeId,
                  providerPodcastId: lastSession.providerPodcastId,
                  providerEpisodeId: lastSession.providerEpisodeId,
                },
              }
            })
            useTranscriptStore.getState().resetTranscript()
            usePlayerSurfaceStore.getState().setPlayableContext(true)
          }
        }

        // Fallback: no matching download or blob missing — restore from remote URL
        if (!get().audioLoaded || get().sessionId !== lastSession.id) {
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
              transcriptUrl: lastSession.transcriptUrl,
              artworkUrl: lastSession.artworkUrl,
              publishedAt: lastSession.publishedAt,
              episodeId: lastSession.episodeId,
              providerPodcastId: lastSession.providerPodcastId,
              providerEpisodeId: lastSession.providerEpisodeId,
            },
          })
          useTranscriptStore.getState().resetTranscript()
          usePlayerSurfaceStore.getState().setPlayableContext(true)
        }
      }

      // 3. Restore subtitle file from IndexedDB
      if (lastSession.subtitleId) {
        const subtitleData = await PlaybackRepository.getSubtitle(lastSession.subtitleId)
        // Race Condition Guard: Ensure we haven't switched tracks
        if (get().loadRequestId !== requestId || signal?.aborted) {
          if (get().loadRequestId === requestId) set({ initializationStatus: 'ready' })
          return
        }
        if (subtitleData) {
          useTranscriptStore.getState().setSubtitles(subtitleData.cues)
        }
      }

      set({ initializationStatus: 'ready' })
    } catch (err) {
      warn('[PlayerStore] Session restoration failed:', err)
      usePlayerSurfaceStore.getState().setPlayableContext(false)
      set({ initializationStatus: 'failed' })
      // Keep it as failed so we can potentially retry or show error UI
    }
  },
}))
