import { ASRClientError, type ASRProvider, transcribeAudioWithRetry } from './asr'
import { backgroundAsrQueue } from './asr/queue'
import type { ASRCue } from './asr/types'
import { isUserUploadTrack } from './db/types'
import { isAbortLikeError } from './fetchUtils'
import { warn } from './logger'
import { normalizeAsrAudioUrl } from './remoteTranscriptResource'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { FilesRepository } from './repositories/FilesRepository'
import { toast } from './toast'

export const RETRANSCRIBE_DOWNLOAD_REASON = {
  SUCCESS: 'success',
  TRACK_NOT_FOUND: 'track_not_found',
  INVALID_SOURCE: 'invalid_source',
  UNCONFIGURED: 'unconfigured',
  IN_FLIGHT: 'in_flight',
  FAILED: 'failed',
  ENQUEUE_FAILED: 'enqueue_failed',
} as const

export type RetranscribeDownloadReason =
  (typeof RETRANSCRIBE_DOWNLOAD_REASON)[keyof typeof RETRANSCRIBE_DOWNLOAD_REASON]

export interface RetranscribeDownloadResult {
  ok: boolean
  reason: RetranscribeDownloadReason
  fileSubtitleId?: string
}

export const RETRANSCRIBE_FILE_REASON = {
  SUCCESS: 'success',
  TRACK_NOT_FOUND: 'track_not_found',
  INVALID_SOURCE: 'invalid_source',
  UNCONFIGURED: 'unconfigured',
  IN_FLIGHT: 'in_flight',
  FAILED: 'failed',
  ENQUEUE_FAILED: 'enqueue_failed',
} as const

export type RetranscribeFileReason =
  (typeof RETRANSCRIBE_FILE_REASON)[keyof typeof RETRANSCRIBE_FILE_REASON]

export interface RetranscribeFileResult {
  ok: boolean
  reason: RetranscribeFileReason
  fileSubtitleId?: string
}

interface RetranscriptionTaskOptions<TReason extends string> {
  asrConfig: {
    asrModel: string
    asrProvider: ASRProvider
    apiKey: string
  }
  enqueueFailedReason: TReason
  expectedAudioUrl: string
  expectedDurationSeconds?: number
  failedReason: TReason
  inFlightReason: TReason
  preferProgressive?: boolean
  successReason: TReason
  trackId: string
  trackKey: string
  trackNotFoundReason: TReason
  enqueueWarnLabel: string
  warnLabel: string
  buildSubtitleTarget: (result: { cues: ASRCue[]; model: string; provider: string }) => {
    subtitleFilename: string
    subtitleName: string
  }
  persistTranscription: (input: {
    cues: ASRCue[]
    fingerprint: string
    provider: string
    model: string
    subtitleName: string
    subtitleFilename: string
  }) => Promise<{ ok: boolean; fileSubtitleId?: string }>
}

interface RetranscriptionRuntimeDeps {
  inFlightAsrTasks: Set<string>
  asrProviderCooldowns: Map<ASRProvider, number>
  buildAsrTrackKey: (expectedAudioUrl: string, localTrackId: string | null) => string
  resolveAsrApiKeyAndSettings: () => Promise<
    | {
        ok: true
        asrProvider: ASRProvider
        asrModel: string
        apiKey: string
      }
    | {
        ok: false
        reasonCode?: string
      }
  >
  formatAsrSubtitleName: (input: { episodeTitle: string; provider: string; model: string }) => {
    subtitleFilename: string
    subtitleName: string
  }
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
  handleAsrFailure: (error: unknown, trigger: 'manual') => unknown
  applyRetranscribedCuesToCurrentTrack: (trackId: string, cues: ASRCue[]) => void
}

async function runQueuedRetranscriptionTask<TReason extends string>(
  deps: RetranscriptionRuntimeDeps,
  options: RetranscriptionTaskOptions<TReason>
): Promise<{ ok: boolean; reason: TReason; fileSubtitleId?: string }> {
  const {
    asrConfig,
    enqueueFailedReason,
    expectedAudioUrl,
    expectedDurationSeconds,
    failedReason,
    inFlightReason,
    preferProgressive,
    successReason,
    trackId,
    trackKey,
    trackNotFoundReason,
    enqueueWarnLabel,
    warnLabel,
    buildSubtitleTarget,
    persistTranscription,
  } = options

  if (deps.inFlightAsrTasks.has(trackKey)) {
    return { ok: false, reason: inFlightReason }
  }
  deps.inFlightAsrTasks.add(trackKey)

  return await new Promise((resolve) => {
    const task = async () => {
      try {
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

        const controller = new AbortController()
        const audioBlob = await deps.fetchTrackAudioBlob(
          expectedAudioUrl,
          trackId,
          controller.signal
        )
        const fingerprint = await deps.computeAsrFingerprint({
          localTrackId: trackId,
          audioBlob,
          model: asrConfig.asrModel,
        })

        const result = await transcribeAudioWithRetry({
          blob: audioBlob,
          apiKey: asrConfig.apiKey,
          provider: asrConfig.asrProvider,
          model: asrConfig.asrModel,
          expectedDurationSeconds,
          signal: controller.signal,
          preferProgressive,
        })

        if (result.cues.length === 0) {
          throw new ASRClientError('ASR returned empty cues', 'service_unavailable')
        }

        const { subtitleFilename, subtitleName } = buildSubtitleTarget({
          cues: result.cues,
          model: result.model,
          provider: result.provider,
        })

        const persistResult = await persistTranscription({
          cues: result.cues,
          fingerprint,
          provider: result.provider,
          model: result.model,
          subtitleName,
          subtitleFilename,
        })

        if (!persistResult.ok || !persistResult.fileSubtitleId) {
          resolve({ ok: false, reason: trackNotFoundReason })
          return
        }

        deps.applyRetranscribedCuesToCurrentTrack(trackId, result.cues)
        toast.successKey('asrSuccess')
        resolve({
          ok: true,
          reason: successReason,
          fileSubtitleId: persistResult.fileSubtitleId,
        })
      } catch (error) {
        if (error instanceof ASRClientError && error.retryAfterMs && error.retryAfterMs > 60000) {
          deps.asrProviderCooldowns.set(asrConfig.asrProvider, Date.now() + error.retryAfterMs)
        }
        deps.handleAsrFailure(error, 'manual')
        if (!isAbortLikeError(error)) {
          warn(warnLabel, { trackId, error })
        }
        resolve({ ok: false, reason: failedReason })
      } finally {
        deps.inFlightAsrTasks.delete(trackKey)
      }
    }

    try {
      void backgroundAsrQueue.enqueuePriority(task)
    } catch (error) {
      deps.inFlightAsrTasks.delete(trackKey)
      if (!isAbortLikeError(error)) {
        warn(enqueueWarnLabel, { trackId, error })
      }
      resolve({ ok: false, reason: enqueueFailedReason })
    }
  })
}

export function createRemoteTranscriptRetranscriptionHandlers(deps: RetranscriptionRuntimeDeps) {
  async function retranscribeDownloadedTrackWithCurrentSettings(
    trackId: string
  ): Promise<RetranscribeDownloadResult> {
    const track = await DownloadsRepository.getTrackSnapshot(trackId)
    if (!track) {
      return { ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.TRACK_NOT_FOUND }
    }

    const expectedAudioUrl = normalizeAsrAudioUrl(track.sourceUrlNormalized)
    if (!expectedAudioUrl) {
      return { ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.INVALID_SOURCE }
    }

    const asrConfig = await deps.resolveAsrApiKeyAndSettings()
    if (!asrConfig.ok) {
      return { ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.UNCONFIGURED }
    }

    const trackKey = deps.buildAsrTrackKey(expectedAudioUrl, trackId)
    return runQueuedRetranscriptionTask(deps, {
      asrConfig,
      enqueueFailedReason: RETRANSCRIBE_DOWNLOAD_REASON.ENQUEUE_FAILED,
      expectedAudioUrl,
      expectedDurationSeconds: track.durationSeconds,
      failedReason: RETRANSCRIBE_DOWNLOAD_REASON.FAILED,
      inFlightReason: RETRANSCRIBE_DOWNLOAD_REASON.IN_FLIGHT,
      successReason: RETRANSCRIBE_DOWNLOAD_REASON.SUCCESS,
      trackId,
      trackKey,
      trackNotFoundReason: RETRANSCRIBE_DOWNLOAD_REASON.TRACK_NOT_FOUND,
      enqueueWarnLabel: '[asr] failed to enqueue download retranscribe task',
      warnLabel: '[asr] retranscribe download failed',
      buildSubtitleTarget: ({ model, provider }) =>
        deps.formatAsrSubtitleName({
          episodeTitle: track.sourceEpisodeTitle || track.name,
          provider,
          model,
        }),
      persistTranscription: ({
        cues,
        fingerprint,
        provider,
        model,
        subtitleName,
        subtitleFilename,
      }) =>
        DownloadsRepository.upsertAsrSubtitleVersion({
          trackId,
          cues,
          subtitleName,
          subtitleFilename,
          provider,
          model,
          fingerprint,
          setActive: true,
        }),
    })
  }

  async function retranscribeFileTrackWithCurrentSettings(
    trackId: string
  ): Promise<RetranscribeFileResult> {
    const track = await FilesRepository.getTrackById(trackId)
    if (!isUserUploadTrack(track)) {
      return { ok: false, reason: RETRANSCRIBE_FILE_REASON.TRACK_NOT_FOUND }
    }

    const expectedAudioUrl = normalizeAsrAudioUrl(track.id)
    if (!expectedAudioUrl) {
      return { ok: false, reason: RETRANSCRIBE_FILE_REASON.INVALID_SOURCE }
    }

    const asrConfig = await deps.resolveAsrApiKeyAndSettings()
    if (!asrConfig.ok) {
      return { ok: false, reason: RETRANSCRIBE_FILE_REASON.UNCONFIGURED }
    }

    const trackKey = deps.buildAsrTrackKey(expectedAudioUrl, trackId)
    return runQueuedRetranscriptionTask(deps, {
      asrConfig,
      enqueueFailedReason: RETRANSCRIBE_FILE_REASON.ENQUEUE_FAILED,
      expectedAudioUrl,
      expectedDurationSeconds: track.durationSeconds,
      failedReason: RETRANSCRIBE_FILE_REASON.FAILED,
      inFlightReason: RETRANSCRIBE_FILE_REASON.IN_FLIGHT,
      preferProgressive: false,
      successReason: RETRANSCRIBE_FILE_REASON.SUCCESS,
      trackId,
      trackKey,
      trackNotFoundReason: RETRANSCRIBE_FILE_REASON.TRACK_NOT_FOUND,
      enqueueWarnLabel: '[asr] failed to enqueue file retranscribe task',
      warnLabel: '[asr] retranscribe file failed',
      buildSubtitleTarget: ({ model, provider }) =>
        deps.formatAsrSubtitleName({
          episodeTitle: track.name,
          provider,
          model,
        }),
      persistTranscription: ({
        cues,
        fingerprint,
        provider,
        model,
        subtitleName,
        subtitleFilename,
      }) =>
        FilesRepository.upsertAsrSubtitleVersion({
          trackId,
          cues,
          subtitleName,
          subtitleFilename,
          provider,
          model,
          fingerprint,
          setActive: true,
        }),
    })
  }

  return {
    retranscribeDownloadedTrackWithCurrentSettings,
    retranscribeFileTrackWithCurrentSettings,
  }
}
