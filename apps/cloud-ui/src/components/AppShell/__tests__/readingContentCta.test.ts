import { describe, expect, it } from 'vitest'
import { PLAYBACK_REQUEST_MODE } from '../../../lib/player/playbackMode'
import { TRANSCRIPT_INGESTION_STATUS } from '../../../store/transcriptStore'
import {
  deriveReadingContentCtaState,
  READING_CONTENT_CTA_STATE,
  STORED_TRANSCRIPT_SOURCE_STATE,
  TRANSCRIPT_LOADING_TIMEOUT_MS,
} from '../readingContentCta'

describe('deriveReadingContentCtaState', () => {
  it('returns none when transcript is currently visible', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: true,
        hasBuiltInTranscriptSource: true,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.IDLE,
        asrGenerationReady: null,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
      })
    ).toEqual({
      state: READING_CONTENT_CTA_STATE.NONE,
      hasTranscriptSource: true,
      isTranscriptVisible: true,
    })
  })

  it('returns transcript_available_show when transcript source exists in pure listening mode', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: true,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.IDLE,
        asrGenerationReady: false,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.TRANSCRIPT_AVAILABLE_SHOW)
  })

  it('treats local transcript content as an available transcript source', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: true,
        hasBuiltInTranscriptSource: false,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.PRESENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.IDLE,
        asrGenerationReady: true,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.TRANSCRIPT_AVAILABLE_SHOW)
  })

  it('returns loading_hidden while transcript is loading during normal playback', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: true,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.LOADING,
        asrGenerationReady: false,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.LOADING_HIDDEN)
  })

  it('returns transcript_available_retry when transcript loading times out with a transcript source', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: true,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.LOADING,
        hasTranscriptLoadingTimedOut: true,
        asrGenerationReady: false,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.TRANSCRIPT_AVAILABLE_RETRY)
    expect(TRANSCRIPT_LOADING_TIMEOUT_MS).toBe(15000)
  })

  it('returns transcript_available_retry when transcript source load failed', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: true,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.FAILED,
        asrGenerationReady: true,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.TRANSCRIPT_AVAILABLE_RETRY)
  })

  it('returns generate/setup only when no transcript source exists', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: false,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.IDLE,
        asrGenerationReady: true,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.NO_TRANSCRIPT_GENERATE)

    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: false,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.IDLE,
        asrGenerationReady: false,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.NO_TRANSCRIPT_SETUP)
  })

  it('returns generate/setup after loading timeout only when no transcript source exists', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: false,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING,
        hasTranscriptLoadingTimedOut: true,
        asrGenerationReady: true,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.NO_TRANSCRIPT_GENERATE)

    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: false,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING,
        hasTranscriptLoadingTimedOut: true,
        asrGenerationReady: false,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.NO_TRANSCRIPT_SETUP)
  })

  it('suppresses fallback CTA while stored transcript source lookup is pending', () => {
    expect(
      deriveReadingContentCtaState({
        hasTranscriptContent: false,
        hasBuiltInTranscriptSource: false,
        storedTranscriptSourceState: STORED_TRANSCRIPT_SOURCE_STATE.UNKNOWN,
        transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.IDLE,
        asrGenerationReady: false,
        hasTargetAudio: true,
        playbackRequestMode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      }).state
    ).toBe(READING_CONTENT_CTA_STATE.NONE)
  })
})
