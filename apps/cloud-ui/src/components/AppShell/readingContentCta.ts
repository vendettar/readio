import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from '../../lib/player/playbackMode'
import {
  TRANSCRIPT_INGESTION_STATUS,
  type TranscriptIngestionStatus,
} from '../../store/transcriptStore'

export const READING_CONTENT_CTA_STATE = {
  NONE: 'none',
  LOADING_HIDDEN: 'loading_hidden',
  TRANSCRIPT_AVAILABLE_SHOW: 'transcript_available_show',
  TRANSCRIPT_AVAILABLE_RETRY: 'transcript_available_retry',
  NO_TRANSCRIPT_GENERATE: 'no_transcript_generate',
  NO_TRANSCRIPT_SETUP: 'no_transcript_setup',
} as const

export const TRANSCRIPT_LOADING_TIMEOUT_MS = 15000

export type ReadingContentCtaState =
  (typeof READING_CONTENT_CTA_STATE)[keyof typeof READING_CONTENT_CTA_STATE]

export const STORED_TRANSCRIPT_SOURCE_STATE = {
  UNKNOWN: 'unknown',
  PRESENT: 'present',
  ABSENT: 'absent',
} as const

export type StoredTranscriptSourceState =
  (typeof STORED_TRANSCRIPT_SOURCE_STATE)[keyof typeof STORED_TRANSCRIPT_SOURCE_STATE]

export interface ReadingContentCtaInput {
  hasTranscriptContent: boolean
  hasBuiltInTranscriptSource: boolean
  storedTranscriptSourceState: StoredTranscriptSourceState
  transcriptIngestionStatus: TranscriptIngestionStatus
  hasTranscriptLoadingTimedOut?: boolean
  asrGenerationReady: boolean | null
  hasTargetAudio: boolean
  playbackRequestMode?: PlaybackRequestMode
}

export interface ReadingContentCtaResult {
  state: ReadingContentCtaState
  hasTranscriptSource: boolean
  isTranscriptVisible: boolean
}

export function deriveReadingContentCtaState(
  input: ReadingContentCtaInput
): ReadingContentCtaResult {
  const isStreamWithoutTranscript =
    input.playbackRequestMode === PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT
  const isTranscriptVisible = input.hasTranscriptContent && !isStreamWithoutTranscript
  const hasStoredTranscriptSource =
    input.storedTranscriptSourceState === STORED_TRANSCRIPT_SOURCE_STATE.PRESENT
  const isStoredTranscriptSourcePending =
    input.storedTranscriptSourceState === STORED_TRANSCRIPT_SOURCE_STATE.UNKNOWN
  const hasTranscriptSource =
    input.hasBuiltInTranscriptSource || hasStoredTranscriptSource || input.hasTranscriptContent
  const isTranscriptLoading =
    input.transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.LOADING ||
    input.transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING
  const hasTranscriptLoadingTimedOut = input.hasTranscriptLoadingTimedOut === true

  if (isTranscriptVisible) {
    return {
      state: READING_CONTENT_CTA_STATE.NONE,
      hasTranscriptSource,
      isTranscriptVisible,
    }
  }

  if (isTranscriptLoading && !isStreamWithoutTranscript && !hasTranscriptLoadingTimedOut) {
    return {
      state: READING_CONTENT_CTA_STATE.LOADING_HIDDEN,
      hasTranscriptSource,
      isTranscriptVisible,
    }
  }

  if (hasTranscriptLoadingTimedOut && hasTranscriptSource) {
    return {
      state: READING_CONTENT_CTA_STATE.TRANSCRIPT_AVAILABLE_RETRY,
      hasTranscriptSource,
      isTranscriptVisible,
    }
  }

  if (
    hasTranscriptSource &&
    input.transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.FAILED
  ) {
    return {
      state: READING_CONTENT_CTA_STATE.TRANSCRIPT_AVAILABLE_RETRY,
      hasTranscriptSource,
      isTranscriptVisible,
    }
  }

  if (hasTranscriptSource) {
    return {
      state: READING_CONTENT_CTA_STATE.TRANSCRIPT_AVAILABLE_SHOW,
      hasTranscriptSource,
      isTranscriptVisible,
    }
  }

  if (isStoredTranscriptSourcePending && input.hasTargetAudio) {
    return {
      state: READING_CONTENT_CTA_STATE.NONE,
      hasTranscriptSource,
      isTranscriptVisible,
    }
  }

  if (input.hasTargetAudio && input.asrGenerationReady === true) {
    return {
      state: READING_CONTENT_CTA_STATE.NO_TRANSCRIPT_GENERATE,
      hasTranscriptSource,
      isTranscriptVisible,
    }
  }

  if (input.hasTargetAudio && input.asrGenerationReady === false) {
    return {
      state: READING_CONTENT_CTA_STATE.NO_TRANSCRIPT_SETUP,
      hasTranscriptSource,
      isTranscriptVisible,
    }
  }

  return {
    state: READING_CONTENT_CTA_STATE.NONE,
    hasTranscriptSource,
    isTranscriptVisible,
  }
}
