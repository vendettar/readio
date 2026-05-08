import { useCallback, useState } from 'react'
import { PLAYBACK_REQUEST_MODE } from '../../lib/player/playbackMode'
import {
  autoIngestEpisodeTranscript,
  getValidTranscriptUrl,
  tryApplyCachedAsrTranscript,
} from '../../lib/remoteTranscript'
import type { EpisodeMetadata, EpisodeMetadataInput } from '../../store/playerStore'
import { TRANSCRIPT_INGESTION_STATUS } from '../../store/transcriptStore'
import {
  STORED_TRANSCRIPT_SOURCE_STATE,
  type StoredTranscriptSourceState,
} from './readingContentCta'
import { useAsrGenerationReadiness } from './useAsrGenerationReadiness'
import { useStoredTranscriptSourceState } from './useStoredTranscriptSourceState'
import { useTranscriptLoadingTimeout } from './useTranscriptLoadingTimeout'

interface UseReadingContentTranscriptStateInput {
  episodeMetadataTranscriptUrl?: string | null
  episodeMetadataPlaybackRequestMode?: string | null
  episodeMetadataForRestore: EpisodeMetadataInput | null
  hasDisplaySubtitles: boolean
  isActiveTranscribing: boolean
  loadRequestId: number
  localTrackId: string | null
  setEpisodeMetadata: (metadata: EpisodeMetadataInput | null) => void
  targetAudioUrl: string
  transcriptIngestionStatus: string
  withDefaultPlaybackRequestMode: (metadata: EpisodeMetadataInput) => EpisodeMetadata | null
}

export function useReadingContentTranscriptState(input: UseReadingContentTranscriptStateInput): {
  asrGenerationReady: boolean | null
  beginTranscriptLoadAttempt: () => void
  hasDeclaredTranscriptSource: boolean
  hasTranscriptLoadingTimedOut: boolean
  shouldEvaluateAsrReadiness: boolean
  showTranscript: () => void
  storedTranscriptSourceState: StoredTranscriptSourceState
} {
  const {
    episodeMetadataTranscriptUrl,
    episodeMetadataPlaybackRequestMode,
    episodeMetadataForRestore,
    hasDisplaySubtitles,
    isActiveTranscribing,
    loadRequestId,
    localTrackId,
    setEpisodeMetadata,
    targetAudioUrl,
    transcriptIngestionStatus,
    withDefaultPlaybackRequestMode,
  } = input

  const [transcriptLoadingAttemptVersion, setTranscriptLoadingAttemptVersion] = useState(0)

  const transcriptSourceUrl = getValidTranscriptUrl(episodeMetadataTranscriptUrl)
  const hasDeclaredTranscriptSource = transcriptSourceUrl !== null
  const storedTranscriptSourceLookupKey = `${localTrackId || ''}::${targetAudioUrl}`
  const storedTranscriptSourceState = useStoredTranscriptSourceState({
    targetAudioUrl,
    localTrackId,
    lookupKey: storedTranscriptSourceLookupKey,
  })

  const shouldSuppressAsrReadinessForTranscriptFirst =
    hasDeclaredTranscriptSource ||
    storedTranscriptSourceState !== STORED_TRANSCRIPT_SOURCE_STATE.ABSENT
  const shouldWatchTranscriptLoadingTimeout =
    (transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.LOADING ||
      transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING) &&
    episodeMetadataPlaybackRequestMode !== PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT
  const transcriptLoadingWatchKey = shouldWatchTranscriptLoadingTimeout
    ? `${loadRequestId}:${targetAudioUrl}:${transcriptSourceUrl || localTrackId || 'none'}:${transcriptLoadingAttemptVersion}`
    : ''
  const hasTranscriptLoadingTimedOut = useTranscriptLoadingTimeout(transcriptLoadingWatchKey)
  const shouldEvaluateAsrReadiness =
    !hasDisplaySubtitles &&
    Boolean(targetAudioUrl) &&
    (!isActiveTranscribing || hasTranscriptLoadingTimedOut) &&
    !shouldSuppressAsrReadinessForTranscriptFirst

  const beginTranscriptLoadAttempt = useCallback(() => {
    setTranscriptLoadingAttemptVersion((version) => version + 1)
  }, [])

  const asrGenerationReady = useAsrGenerationReadiness(shouldEvaluateAsrReadiness)

  const showTranscript = useCallback(() => {
    if (episodeMetadataForRestore) {
      const playbackMetadata = withDefaultPlaybackRequestMode(episodeMetadataForRestore)
      if (playbackMetadata) {
        setEpisodeMetadata(playbackMetadata)
      }
    }

    if (hasDisplaySubtitles) {
      return
    }

    beginTranscriptLoadAttempt()

    void (async () => {
      const appliedStoredTranscript = await tryApplyCachedAsrTranscript(
        targetAudioUrl,
        localTrackId,
        loadRequestId
      )

      if (appliedStoredTranscript) {
        return
      }

      if (hasDeclaredTranscriptSource) {
        autoIngestEpisodeTranscript(transcriptSourceUrl || undefined, targetAudioUrl)
      }
    })()
  }, [
    beginTranscriptLoadAttempt,
    episodeMetadataForRestore,
    hasDeclaredTranscriptSource,
    hasDisplaySubtitles,
    loadRequestId,
    localTrackId,
    setEpisodeMetadata,
    targetAudioUrl,
    transcriptSourceUrl,
    withDefaultPlaybackRequestMode,
  ])

  return {
    asrGenerationReady,
    beginTranscriptLoadAttempt,
    hasDeclaredTranscriptSource,
    hasTranscriptLoadingTimedOut,
    shouldEvaluateAsrReadiness,
    showTranscript,
    storedTranscriptSourceState,
  }
}
