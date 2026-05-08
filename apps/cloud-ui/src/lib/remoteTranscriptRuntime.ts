import type { EpisodeMetadataInput } from '../store/playerStore'
import { usePlayerStore } from '../store/playerStore'
import {
  TRANSCRIPT_INGESTION_STATUS,
  useTranscriptStore,
} from '../store/transcriptStore'
import type { ASRCue } from './asr/types'
import { resolvePlaybackSourceAudioUrl } from './player/playbackMetadata'
import { normalizeAsrAudioUrl } from './remoteTranscriptResource'

export function getPlayerStoreStateSafe(): ReturnType<typeof usePlayerStore.getState> | null {
  const store = usePlayerStore as typeof usePlayerStore & {
    getState?: () => ReturnType<typeof usePlayerStore.getState>
  }
  if (typeof store.getState !== 'function') return null
  return store.getState()
}

export function resolveAsrIdentityUrl(
  audioUrl: string | null | undefined,
  metadata?: EpisodeMetadataInput | null
): string {
  return resolvePlaybackSourceAudioUrl(audioUrl, metadata)
}

export function isTrackStillCurrent(expectedAudioUrl: string, requestId: number): boolean {
  const current = getPlayerStoreStateSafe()
  if (!current) return false
  const identityUrl = resolveAsrIdentityUrl(current.audioUrl, current.episodeMetadata)
  return current.loadRequestId === requestId && identityUrl === expectedAudioUrl
}

export function clearAsrStateForTrack(
  expectedAudioUrl: string,
  requestId: number,
  status: typeof TRANSCRIPT_INGESTION_STATUS.IDLE | typeof TRANSCRIPT_INGESTION_STATUS.FAILED,
  error: { code: string; message: string } | null = null
): void {
  if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return

  if (!getPlayerStoreStateSafe()) return
  const transcriptState = useTranscriptStore.getState()
  transcriptState.setAbortAsrController(null)
  transcriptState.setAsrActiveTrackKey(null)
  transcriptState.setTranscriptIngestionError(error)
  transcriptState.setTranscriptIngestionStatus(status)
}

export function buildAsrTrackKey(expectedAudioUrl: string, localTrackId: string | null): string {
  if (localTrackId) return `local:${localTrackId}`
  return `podcast:${normalizeAsrAudioUrl(expectedAudioUrl)}`
}

export function applyRetranscribedCuesToCurrentTrack(trackId: string, cues: ASRCue[]): void {
  const playerState = getPlayerStoreStateSafe()
  if (playerState?.localTrackId === trackId) {
    useTranscriptStore.getState().setSubtitles(cues)
  }
}
