import { create } from 'zustand'
import { logError, warn } from '../lib/logger'
import {
  normalizeEpisodeMetadata,
  type EpisodeMetadataInput,
} from '../lib/player/playbackMetadata'
import { collectPlaybackBlobUrls, revokePlaybackBlobUrls } from '../lib/player/playerBlobUrls'
import { getAppConfig } from '../lib/runtimeConfig'
import {
  applyLoadedSubtitles,
  createPlayerStoreBlobLoadState,
  persistManualAudioLoadInBackground,
  persistManualSubtitlesInBackground,
  readSubtitleFile,
  resetTranscriptAfterMediaLoad,
} from './playerStoreMediaLoading'
import {
  persistPlayerEndedProgress,
  persistPlayerProgressOnUnmount,
  persistPlayerProgressUpdate,
} from './playerStoreProgressPersistence'
import {
  resolvePauseState,
  resolvePlayState,
  resolvePlayerErrorState,
  resolveTogglePlayPauseState,
} from './playerStorePlaybackControls'
import {
  resolvePlayerStoreAudioTransition,
  type PlayerStoreAudioTransitionState,
} from './playerStoreAudioTransition'
import {
  restorePlayerStoreSession,
  type PlayerStoreSessionRestoreState,
} from './playerStoreSessionRestore'
import {
  persistPlayerPlaybackRate,
  persistPlayerVolume,
  readInitialPlayerPlaybackRate,
  readInitialPlayerVolume,
} from './playerStorePreferences'
import { useTranscriptStore } from './transcriptStore'
export type {
  CanonicalEpisodeMetadata,
  CanonicalRemoteEpisodeMetadata,
  EpisodeMetadata,
  EpisodeMetadataInput,
} from '../lib/player/playbackMetadata'
export {
  isCanonicalEpisodeMetadata,
  isCanonicalRemoteEpisodeMetadata,
  isLocalEpisodeMetadata,
  normalizeCountryAtSave,
  normalizePlaybackAudioUrl,
  resolveCanonicalPlaybackIdentity,
} from '../lib/player/playbackMetadata'

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
  playbackSourceUrl: string | null
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
  episodeMetadata: EpisodeMetadataInput | null

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
    metadata?: EpisodeMetadataInput | null,
    isPlaying?: boolean
  ) => void
  setPlaybackSourceUrl: (url: string | null) => void

  setSessionId: (id: string | null) => void
  suspendSessionPersistence: () => void
  setPlaybackTrackId: (id: string | null) => void
  setEpisodeMetadata: (metadata: EpisodeMetadataInput | null) => void
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
    metadata?: EpisodeMetadataInput | null
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
  playbackSourceUrl: null as string | null,
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
  episodeMetadata: null as EpisodeMetadataInput | null,
  activeBlobUrls: [] as string[],

  initializationStatus: INITIALIZATION_STATUS.IDLE,
  status: PLAYER_STATUS.IDLE,
  loadRequestId: 0,
}

function resolveMetadataDurationSeconds(
  metadata: EpisodeMetadataInput | null | undefined
): number | undefined {
  if (typeof metadata?.durationSeconds !== 'number') return undefined
  return Number.isFinite(metadata.durationSeconds) ? metadata.durationSeconds : undefined
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...initialState,
  volume: readInitialPlayerVolume(),
  playbackRate: readInitialPlayerPlaybackRate(),

  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => {
    const newVolume = persistPlayerVolume(volume)
    set({ volume: newVolume })
  },
  setPlaybackRate: (rate) => {
    const newRate = persistPlayerPlaybackRate(rate)
    set({ playbackRate: newRate })
  },
  setAudioUrl: (url, title = '', coverArt = '', metadata = null, isPlayingOverride?: boolean) => {
    const normalizedUrl = url || null
    const state = get()
    const normalizedMetadata = normalizeEpisodeMetadata(metadata)
    const nextDurationSeconds = resolveMetadataDurationSeconds(normalizedMetadata)

    const transition = resolvePlayerStoreAudioTransition(
      state as PlayerStoreAudioTransitionState,
      {
        url: normalizedUrl,
        title,
        coverArt,
        metadata: normalizedMetadata,
        isPlayingOverride,
        nextDurationSeconds,
      }
    )

    if (transition.kind === 'same-track') {
      set(transition.nextStatePatch)
      return
    }

    if (transition.kind === 'same-track-url-swap') {
      revokePlaybackBlobUrls(state.activeBlobUrls)
      const newBlobUrls = collectPlaybackBlobUrls(normalizedUrl, coverArt)

      set({
        ...transition.nextStatePatch,
        activeBlobUrls: newBlobUrls,
      })
      return
    }

    revokePlaybackBlobUrls(state.activeBlobUrls)
    const newBlobUrls = collectPlaybackBlobUrls(normalizedUrl, coverArt)

    set({
      ...transition.nextStatePatch,
      activeBlobUrls: newBlobUrls,
    })

    if (transition.shouldResetTranscript) {
      useTranscriptStore.getState().resetTranscript()
    }
  },

  setSessionId: (id) => set({ sessionId: id }),
  setPlaybackSourceUrl: (url) => set({ playbackSourceUrl: url }),
  suspendSessionPersistence: () => set({ sessionPersistenceSuspended: true, sessionId: null }),
  setPlaybackTrackId: (id) => set({ localTrackId: id }),
  setEpisodeMetadata: (metadata) => set({ episodeMetadata: normalizeEpisodeMetadata(metadata) }),

  // Unified seek entry point: sets pendingSeek, App layer listens and syncs to audio element
  seekTo: (time) =>
    set((state) => {
      const clampedTime = Math.max(0, Math.min(time, state.duration || Infinity))
      return { pendingSeek: clampedTime, progress: clampedTime }
    }),
  clearPendingSeek: () => set({ pendingSeek: null }),
  queueAutoplayAfterPendingSeek: () => set({ autoplayAfterPendingSeek: true }),
  clearAutoplayAfterPendingSeek: () => set({ autoplayAfterPendingSeek: false }),

  play: () => set((state) => resolvePlayState(state)),
  pause: () => set((state) => resolvePauseState(state)),
  togglePlayPause: () => set((state) => resolveTogglePlayPauseState(state)),
  setStatus: (status) => set({ status }),
  setPlayerError: (message) => {
    const resolved = resolvePlayerErrorState(message)
    if (resolved.kind === 'autoplay-blocked') {
      warn('[PlayerStore] Player autoplay blocked:', message)
      set(resolved.nextState)
    } else {
      logError('[PlayerStore] Player Error:', message)
      set(resolved.nextState)
    }
  },

  reset: () => {
    set((state) => {
      revokePlaybackBlobUrls(state.activeBlobUrls)
      return {
        ...initialState,
        volume: state.volume,
        playbackRate: state.playbackRate,
      }
    })
    useTranscriptStore.getState().resetTranscript()
  },

  loadAudio: async (file, signal) => {
    void persistManualAudioLoadInBackground(file, () => get().sessionId)

    set((state) => {
      return createPlayerStoreBlobLoadState(
        state as PlayerStoreAudioTransitionState & { activeBlobUrls: string[] },
        {
          blob: file,
          title: file.name,
          coverArt: null,
          sessionId: null,
          metadata: null,
          nextDurationSeconds: 0,
        }
      )
    })

    resetTranscriptAfterMediaLoad()
    if (signal?.aborted) return
  },

  loadAudioBlob: async (blob, title, artwork, sessionId = null, signal, metadata = null) => {
    const normalizedMetadata = normalizeEpisodeMetadata(metadata)
    const nextDurationSeconds = resolveMetadataDurationSeconds(normalizedMetadata) ?? 0

    set((state) => {
      return createPlayerStoreBlobLoadState(
        state as PlayerStoreAudioTransitionState & { activeBlobUrls: string[] },
        {
          blob,
          title,
          coverArt: artwork || null,
          sessionId: sessionId || null,
          metadata: normalizedMetadata,
          nextDurationSeconds,
        }
      )
    })

    resetTranscriptAfterMediaLoad()
    if (signal?.aborted) return
  },

  loadSubtitles: async (file, signal) => {
    const requestId = get().loadRequestId + 1
    set({ loadRequestId: requestId })

    const subtitles = await readSubtitleFile(file)
    if (get().loadRequestId !== requestId || signal?.aborted) return

    void persistManualSubtitlesInBackground(file.name, subtitles, () => get().sessionId)
    applyLoadedSubtitles(subtitles)
  },

  // Throttled progress update with DB persistence
  updateProgress: (time) => {
    const config = getAppConfig()

    // Always update the store state
    set({ progress: time })

    const state = get()
    persistPlayerProgressUpdate({
      time,
      saveIntervalMs: config.SAVE_PROGRESS_INTERVAL_MS,
      state,
      detachSessionPersistence: () => set({ sessionId: null, sessionPersistenceSuspended: true }),
    })
  },

  handleEndedPlayback: async (endedProgress) => {
    const state = get()
    const clampedEndedProgress = Math.max(0, Math.min(endedProgress, state.duration || Infinity))

    set((current) => ({
      progress: clampedEndedProgress,
      isPlaying: false,
      status:
        current.status === PLAYER_STATUS.PLAYING || current.status === PLAYER_STATUS.LOADING
          ? PLAYER_STATUS.PAUSED
          : current.status,
    }))

    const postPauseState = get()
    await persistPlayerEndedProgress({
      sessionId: postPauseState.sessionId,
      duration: postPauseState.duration,
      detachSessionPersistence: () => set({ sessionId: null, sessionPersistenceSuspended: true }),
    })
  },

  // Force immediate save (for unmount)
  // NOTE: This is a "persistence side-effect" and should NOT update loadRequestId
  // to avoid accidentally canceling ongoing restore/load operations
  saveProgressNow: async (signal) => {
    const state = get()
    await persistPlayerProgressOnUnmount({
      signal,
      state,
      detachSessionPersistence: () => set({ sessionId: null, sessionPersistenceSuspended: true }),
    })
  },

  // Encapsulated restoration logic
  restoreSession: async (signal): Promise<void> =>
    restorePlayerStoreSession({
      signal,
      getState: () => get() as PlayerStoreSessionRestoreState,
      setState: (patch) => set(patch as never),
    }),
}))
