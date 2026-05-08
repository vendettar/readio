import {
  type EpisodeMetadataInput,
  usePlayerStore,
} from '../store/playerStore'
import {
  TRANSCRIPT_INGESTION_STATUS,
  useTranscriptStore,
} from '../store/transcriptStore'
import { ASRClientError, type ASRProvider, transcribeAudioWithRetry } from './asr'
import { backgroundAsrQueue } from './asr/queue'
import type { ASRCue } from './asr/types'
import { log, logError } from './logger'
import { toast } from './toast'

type OnlineAsrTrigger = 'auto' | 'manual'

interface ResolveAsrConfigResultOk {
  ok: true
  asrProvider: ASRProvider
  asrModel: string
  apiKey: string
}

interface ResolveAsrConfigResultFailed {
  ok: false
  reasonCode?: string
}

interface OnlineAsrFlowDeps {
  inFlightAsrTasks: Set<string>
  asrProviderCooldowns: Map<ASRProvider, number>
  buildAsrTrackKey: (expectedAudioUrl: string, localTrackId: string | null) => string
  isTrackStillCurrent: (expectedAudioUrl: string, requestId: number) => boolean
  resolveAsrApiKeyAndSettings: () => Promise<ResolveAsrConfigResultOk | ResolveAsrConfigResultFailed>
  clearAsrStateForTrack: (
    expectedAudioUrl: string,
    requestId: number,
    status: typeof TRANSCRIPT_INGESTION_STATUS.IDLE | typeof TRANSCRIPT_INGESTION_STATUS.FAILED,
    error?: { code: string; message: string } | null
  ) => void
  tryApplyCachedAsrTranscript: (
    expectedAudioUrl: string,
    localTrackId: string | null,
    requestId: number
  ) => Promise<boolean>
  fetchTrackAudioBlob: (
    expectedAudioUrl: string,
    localTrackId: string | null,
    signal?: AbortSignal
  ) => Promise<Blob>
  computeAsrFingerprint: (options: {
    localTrackId: string | null
    audioBlob: Blob
    model: string
  }) => Promise<string>
  tryApplyFingerprintCache: (
    fingerprint: string,
    expectedAudioUrl: string,
    requestId: number
  ) => Promise<boolean>
  persistAsrResult: (options: {
    expectedAudioUrl: string
    localTrackId: string | null
    episodeTitle: string
    model: string
    provider: string
    cues: ASRCue[]
    taskStartedAt: number
    fingerprint?: string
  }) => Promise<void>
  handleAsrFailure: (
    error: unknown,
    trigger: OnlineAsrTrigger
  ) => { status: 'idle' | 'failed'; error: { code: string; message: string } | null }
  scheduleBestEffortRemoteAutoSave: (options: {
    audioBlob: Blob
    expectedAudioUrl: string
    trackKey: string
    episodeMetadata: EpisodeMetadataInput | null | undefined
    audioTitle: string
  }) => void
}

export function createRemoteTranscriptOnlineAsrHandlers(deps: OnlineAsrFlowDeps) {
  async function startOnlineASRForTrack(options: {
    expectedAudioUrl: string
    requestId: number
    localTrackId: string | null
    trigger: OnlineAsrTrigger
  }): Promise<void> {
    const { expectedAudioUrl, requestId, localTrackId, trigger } = options
    const taskStartedAt = Date.now()

    const trackKeyCheck = deps.buildAsrTrackKey(expectedAudioUrl, localTrackId)
    if (deps.inFlightAsrTasks.has(trackKeyCheck)) return
    deps.inFlightAsrTasks.add(trackKeyCheck)

    let shouldEnqueue = false
    let asrConfig: ResolveAsrConfigResultOk | ResolveAsrConfigResultFailed = { ok: false }

    try {
      if (!deps.isTrackStillCurrent(expectedAudioUrl, requestId)) return

      asrConfig = await deps.resolveAsrApiKeyAndSettings()
      if (!asrConfig.ok) {
        const status =
          trigger === 'auto' ? TRANSCRIPT_INGESTION_STATUS.IDLE : TRANSCRIPT_INGESTION_STATUS.FAILED
        deps.clearAsrStateForTrack(
          expectedAudioUrl,
          requestId,
          status,
          trigger === 'auto'
            ? undefined
            : {
                code: asrConfig.reasonCode ?? 'unconfigured',
                message: asrConfig.reasonCode ?? 'Missing ASR Provider or Model',
              }
        )
        return
      }

      if (await deps.tryApplyCachedAsrTranscript(expectedAudioUrl, localTrackId, requestId)) {
        deps.clearAsrStateForTrack(expectedAudioUrl, requestId, TRANSCRIPT_INGESTION_STATUS.IDLE)
        return
      }

      shouldEnqueue = true
    } finally {
      if (!shouldEnqueue) {
        deps.inFlightAsrTasks.delete(trackKeyCheck)
      }
    }

    const task = async () => {
      try {
        if (!deps.isTrackStillCurrent(expectedAudioUrl, requestId)) return

        let activeController: AbortController | null = null
        const trackKey = trackKeyCheck

        try {
          const transcriptState = useTranscriptStore.getState()
          if (transcriptState.transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING) {
            if (transcriptState.asrActiveTrackKey === trackKey) return
            transcriptState.abortAsrController?.abort()
          }

          const controller = new AbortController()
          activeController = controller
          transcriptState.setAsrActiveTrackKey(trackKey)
          transcriptState.setAbortAsrController(controller)
          transcriptState.setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.LOADING)

          log('[asr] starting sequential task', { trackKey, trigger })

          if (!asrConfig.ok) throw new Error('Missing asr runtime config')

          const cooldownUntil = deps.asrProviderCooldowns.get(asrConfig.asrProvider) || 0
          const now = Date.now()
          if (now < cooldownUntil) {
            throw new ASRClientError(
              'Provider rate limited. Please try again later.',
              'rate_limited',
              429,
              cooldownUntil - now,
              'asph'
            )
          }

          const audioBlob = await deps.fetchTrackAudioBlob(
            expectedAudioUrl,
            localTrackId,
            controller.signal
          )
          const fingerprint = await deps.computeAsrFingerprint({
            localTrackId,
            audioBlob,
            model: asrConfig.asrModel,
          })

          if (await deps.tryApplyFingerprintCache(fingerprint, expectedAudioUrl, requestId)) {
            log('[asr] fingerprint cache hit', { trackKey, fingerprint })
            deps.clearAsrStateForTrack(expectedAudioUrl, requestId, TRANSCRIPT_INGESTION_STATUS.IDLE)
            return
          }

          if (!deps.isTrackStillCurrent(expectedAudioUrl, requestId)) return

          if (!localTrackId) {
            const freshState = usePlayerStore.getState()
            deps.scheduleBestEffortRemoteAutoSave({
              audioBlob,
              expectedAudioUrl,
              trackKey,
              episodeMetadata: freshState.episodeMetadata,
              audioTitle: freshState.audioTitle,
            })
          }

          if (!deps.isTrackStillCurrent(expectedAudioUrl, requestId)) return

          useTranscriptStore
            .getState()
            .setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING)

          const playerState = usePlayerStore.getState()
          const metadataDuration = playerState.episodeMetadata?.durationSeconds
          const expectedDurationSeconds =
            typeof metadataDuration === 'number' && metadataDuration > 0
              ? metadataDuration
              : playerState.duration > 0
                ? playerState.duration
                : undefined

          const result = await transcribeAudioWithRetry({
            blob: audioBlob,
            apiKey: asrConfig.apiKey,
            provider: asrConfig.asrProvider,
            model: asrConfig.asrModel,
            expectedDurationSeconds,
            signal: controller.signal,
            onProgress: (partialCues) => {
              if (!deps.isTrackStillCurrent(expectedAudioUrl, requestId)) return
              useTranscriptStore.getState().setPartialAsrCues(partialCues)
            },
          })

          if (!deps.isTrackStillCurrent(expectedAudioUrl, requestId)) return

          const cues = result.cues
          if (cues.length === 0) {
            throw new ASRClientError('ASR returned empty cues', 'service_unavailable')
          }

          await deps.persistAsrResult({
            expectedAudioUrl,
            localTrackId,
            episodeTitle: usePlayerStore.getState().audioTitle,
            model: result.model,
            provider: result.provider,
            cues,
            fingerprint,
            taskStartedAt,
          })

          if (!deps.isTrackStillCurrent(expectedAudioUrl, requestId)) return
          const currentTranscriptState = useTranscriptStore.getState()
          currentTranscriptState.setPartialAsrCues(null)
          currentTranscriptState.setSubtitles(cues)
          if (trigger === 'manual') {
            toast.successKey('asrSuccess')
          }
          log('[asr] success', { trackKey, cueCount: cues.length, fingerprint })
        } catch (error) {
          if (
            error instanceof ASRClientError &&
            error.retryAfterMs &&
            error.retryAfterMs > 60000 &&
            asrConfig.ok
          ) {
            deps.asrProviderCooldowns.set(asrConfig.asrProvider, Date.now() + error.retryAfterMs)
          }

          if (deps.isTrackStillCurrent(expectedAudioUrl, requestId)) {
            const result = deps.handleAsrFailure(error, trigger)
            deps.clearAsrStateForTrack(expectedAudioUrl, requestId, result.status, result.error)
            if (result.status === TRANSCRIPT_INGESTION_STATUS.FAILED) {
              logError('[asr] task failed', error)
            }
          }
        } finally {
          const latestTranscriptState = useTranscriptStore.getState()
          if (activeController && latestTranscriptState.abortAsrController === activeController) {
            latestTranscriptState.setAbortAsrController(null)
            latestTranscriptState.setAsrActiveTrackKey(null)
            latestTranscriptState.setPartialAsrCues(null)
          }
        }
      } finally {
        deps.inFlightAsrTasks.delete(trackKeyCheck)
      }
    }

    try {
      if (trigger === 'manual') {
        void backgroundAsrQueue.enqueuePriority(task)
      } else {
        void backgroundAsrQueue.enqueue(task)
      }
    } catch (error) {
      deps.inFlightAsrTasks.delete(trackKeyCheck)
      throw error
    }
  }

  return {
    startOnlineASRForTrack,
  }
}
