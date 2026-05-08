import {
  TRANSCRIPT_INGESTION_STATUS,
  type TranscriptIngestionStatus,
  useTranscriptStore,
} from '../store/transcriptStore'
import type { ASRCue } from './asr/types'
import { log } from './logger'
import type { EpisodeMetadataInput } from './player/playbackMetadata'

interface PlaybackSnapshot {
  audioUrl: string | null
  episodeMetadata: EpisodeMetadataInput | null | undefined
  loadRequestId: number
  localTrackId: string | null
}

interface AutoIngestDeps {
  getPlayerStoreStateSafe: () => PlaybackSnapshot | null
  getValidTranscriptUrl: (value: string | undefined) => string | null
  loadRemoteTranscriptWithCache: (url: string) => Promise<{
    ok: boolean
    cues: ASRCue[]
    source?: string
    status?: string
    reason?: string
  }>
  resolveAsrIdentityUrl: (
    audioUrl: string | null | undefined,
    metadata?: EpisodeMetadataInput | null | undefined
  ) => string
  startOnlineASRForTrack: (options: {
    expectedAudioUrl: string
    requestId: number
    localTrackId: string | null
    trigger: 'auto'
  }) => Promise<void>
}

export function createRemoteTranscriptAutoIngestHandler(deps: AutoIngestDeps) {
  return function autoIngestEpisodeTranscript(
    transcriptUrl?: string,
    expectedAudioUrl?: string
  ): void {
    const normalizedUrl = deps.getValidTranscriptUrl(transcriptUrl) || ''
    if (!expectedAudioUrl) return

    const startState = deps.getPlayerStoreStateSafe()
    if (!startState) return
    const requestId = startState.loadRequestId

    const setIngestionStatusIfCurrentTrack = (status: TranscriptIngestionStatus): boolean => {
      const current = deps.getPlayerStoreStateSafe()
      if (!current) return false
      const identityUrl = deps.resolveAsrIdentityUrl(current.audioUrl, current.episodeMetadata)
      const samePlayback = current.loadRequestId === requestId && identityUrl === expectedAudioUrl
      if (!samePlayback) return false
      useTranscriptStore.getState().setTranscriptIngestionStatus(status)
      return true
    }

    const transcriptSourceHost = (() => {
      if (!normalizedUrl) return null
      try {
        return new URL(normalizedUrl).host || null
      } catch {
        return null
      }
    })()

    const setTranscriptFailureIfCurrentTrack = (
      code: string,
      message: string,
      details?: Record<string, unknown>
    ): void => {
      const current = deps.getPlayerStoreStateSafe()
      if (!current) return
      const identityUrl = deps.resolveAsrIdentityUrl(current.audioUrl, current.episodeMetadata)
      const samePlayback = current.loadRequestId === requestId && identityUrl === expectedAudioUrl
      if (!samePlayback) return
      useTranscriptStore.getState().setTranscriptIngestionError({ code, message })
      useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.FAILED)
      log('[remoteTranscript] Transcript fetch failed; transcript source remains available', {
        expectedAudioUrl,
        transcriptSourceHost,
        code,
        ...details,
      })
    }

    if (!normalizedUrl) {
      void deps.startOnlineASRForTrack({
        expectedAudioUrl,
        requestId,
        localTrackId: startState.localTrackId,
        trigger: 'auto',
      })
      return
    }

    log(
      '[remoteTranscript] Transcript-first branch active; automatic ASR disabled because transcript exists',
      {
        expectedAudioUrl,
        transcriptSourceHost,
      }
    )

    if (!setIngestionStatusIfCurrentTrack(TRANSCRIPT_INGESTION_STATUS.LOADING)) return

    void deps
      .loadRemoteTranscriptWithCache(normalizedUrl)
      .then((result) => {
        if (!result.ok || result.cues.length === 0) {
          setTranscriptFailureIfCurrentTrack(
            'transcript_fetch_failed',
            'Transcript available but could not be loaded',
            {
              source: result.source,
              cacheStatus: result.status,
              failureReason: result.reason ?? 'unknown',
            }
          )
          return
        }

        const current = deps.getPlayerStoreStateSafe()
        if (!current) return
        const identityUrl = deps.resolveAsrIdentityUrl(current.audioUrl, current.episodeMetadata)
        const samePlayback = current.loadRequestId === requestId && identityUrl === expectedAudioUrl

        if (!samePlayback) {
          log('[remoteTranscript] Skip apply due to playback switch', { expectedAudioUrl })
          return
        }

        if (useTranscriptStore.getState().subtitlesLoaded) {
          useTranscriptStore
            .getState()
            .setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.IDLE)
          log('[remoteTranscript] Skip apply because subtitles already loaded', {
            expectedAudioUrl,
          })
          return
        }

        useTranscriptStore.getState().setSubtitles(result.cues)
        log('[remoteTranscript] Applied transcript cues', {
          expectedAudioUrl,
          cueCount: result.cues.length,
          source: result.source,
          cacheStatus: result.status,
        })
      })
      .catch((error) => {
        setTranscriptFailureIfCurrentTrack(
          'transcript_fetch_failed',
          'Transcript available but could not be loaded',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        )
        log('[remoteTranscript] auto-ingest failed', error)
      })
  }
}
