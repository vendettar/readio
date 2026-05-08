import { warn } from '../lib/logger'
import { revokePlaybackBlobUrls } from '../lib/player/playerBlobUrls'
import { loadPlayerSessionRestore } from '../lib/player/session/playerSessionRestoreService'
import { usePlayerSurfaceStore } from './playerSurfaceStore'
import { useTranscriptStore } from './transcriptStore'

type InitializationStatus = 'idle' | 'restoring' | 'ready' | 'failed'
type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PlayerStoreSessionRestoreState {
  initializationStatus: InitializationStatus
  loadRequestId: number
  activeBlobUrls: string[]
  duration: number
  audioUrl: string | null
  playbackSourceUrl: string | null
  audioLoaded: boolean
  audioTitle: string
  coverArtUrl: string | Blob | null
  progress: number
  status: PlayerStatus
  isPlaying: boolean
  sessionId: string | null
  localTrackId: string | null
  episodeMetadata: unknown
}

type PlayerStoreSessionRestorePatch = Partial<PlayerStoreSessionRestoreState>

export async function restorePlayerStoreSession(options: {
  signal?: AbortSignal
  getState: () => PlayerStoreSessionRestoreState
  setState: (
    patch:
      | PlayerStoreSessionRestorePatch
      | ((state: PlayerStoreSessionRestoreState) => PlayerStoreSessionRestorePatch)
  ) => void
}): Promise<void> {
  const { initializationStatus, loadRequestId } = options.getState()
  if (initializationStatus === 'restoring' || initializationStatus === 'ready') return

  const requestId = loadRequestId + 1
  options.setState({ initializationStatus: 'restoring', loadRequestId: requestId })

  try {
    const restored = await loadPlayerSessionRestore()
    if (!restored.hasResumableSession) {
      if (options.getState().loadRequestId !== requestId || options.signal?.aborted) return
      usePlayerSurfaceStore.getState().setPlayableContext(false)
      options.setState({ initializationStatus: 'ready' })
      return
    }

    if (options.getState().loadRequestId !== requestId || options.signal?.aborted) {
      revokePlaybackBlobUrls(restored.restoredState?.activeBlobUrls ?? [])
      if (options.getState().loadRequestId === requestId) {
        options.setState({ initializationStatus: 'ready' })
      }
      return
    }

    const durationPatch =
      typeof restored.durationSeconds === 'number' ? { duration: restored.durationSeconds } : {}

    if (restored.restoredState) {
      options.setState((state) => {
        revokePlaybackBlobUrls(state.activeBlobUrls)
        return {
          ...restored.restoredState,
          ...durationPatch,
          initializationStatus: 'ready',
        }
      })
      useTranscriptStore.getState().resetTranscript()
      usePlayerSurfaceStore.getState().setPlayableContext(true)
    } else {
      options.setState({
        ...durationPatch,
        initializationStatus: 'ready',
      })
    }

    if (restored.subtitleCues) {
      useTranscriptStore.getState().setSubtitles(restored.subtitleCues)
    }
  } catch (err) {
    warn('[PlayerStore] Session restoration failed:', err)
    usePlayerSurfaceStore.getState().setPlayableContext(false)
    options.setState({ initializationStatus: 'failed' })
  }
}
