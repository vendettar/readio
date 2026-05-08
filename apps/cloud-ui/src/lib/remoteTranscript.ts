import {
  useTranscriptStore,
} from '../store/transcriptStore'
import { ASRClientError, type ASRProvider } from './asr'
import {
  type AsrConfigErrorCode,
  resolveAsrEffectiveModel,
  validateAsrProviderModelSelection,
} from './asr/registry'
import { getAsrCredentialKey, getCredential } from './db/credentialsRepository'
import {
  buildDownloadJobOptionsFromCanonicalRemoteMetadata,
  persistAudioBlobAsDownload,
} from './downloadService'
import { log, warn } from './logger'
import {
  computeAsrFingerprint,
  findStoredTranscriptCues,
  findTranscriptCuesByFingerprint,
} from './remoteTranscriptCache'
import {
  formatAsrSubtitleName,
  persistAsrResult,
} from './remoteTranscriptPersistence'
import {
  __resetRemoteTranscriptResourceStateForTests,
  getValidTranscriptUrl,
  loadRemoteTranscriptWithCache,
} from './remoteTranscriptResource'
import { createRemoteTranscriptAutoIngestHandler } from './remoteTranscriptAutoIngest'
import {
  createRemoteTranscriptRetranscriptionHandlers,
  RETRANSCRIBE_DOWNLOAD_REASON,
  RETRANSCRIBE_FILE_REASON,
} from './remoteTranscriptRetranscription'
import { AudioDownloadError, fetchTrackAudioBlob } from './remoteTranscriptAudioSource'
import { createRemoteTranscriptOnlineAsrHandlers } from './remoteTranscriptOnlineAsr'
import { getSettingsSnapshot } from './schemas/settings'
import { toast } from './toast'
import {
  resolveCanonicalRemotePlaybackSource,
} from './player/playbackMetadata'
import {
  applyRetranscribedCuesToCurrentTrack,
  buildAsrTrackKey,
  clearAsrStateForTrack,
  getPlayerStoreStateSafe,
  isTrackStillCurrent,
  resolveAsrIdentityUrl,
} from './remoteTranscriptRuntime'

export {
  deriveRemoteTranscriptCacheId,
  REMOTE_TRANSCRIPT_FORMAT,
  REMOTE_TRANSCRIPT_READ_STATUS,
  getValidTranscriptUrl,
  loadRemoteTranscriptWithCache,
  normalizeAsrAudioUrl,
  normalizeTranscriptUrl,
  parseRemoteTranscriptContent,
  readRemoteTranscriptCache,
  runRemoteTranscriptCacheMaintenance,
} from './remoteTranscriptResource'

export type {
  RemoteTranscriptFormat,
  RemoteTranscriptLoadResult,
  RemoteTranscriptParseFailure,
  RemoteTranscriptParseResult,
  RemoteTranscriptParseSuccess,
  RemoteTranscriptReadStatus,
} from './remoteTranscriptResource'

interface AsrSettingsSnapshot {
  asrProvider: ASRProvider | ''
  asrModel: string
}

type OnlineAsrTrigger = 'auto' | 'manual'
export { RETRANSCRIBE_DOWNLOAD_REASON, RETRANSCRIBE_FILE_REASON }
export type {
  RetranscribeDownloadReason,
  RetranscribeDownloadResult,
  RetranscribeFileReason,
  RetranscribeFileResult,
} from './remoteTranscriptRetranscription'
export { hasStoredTranscriptSource } from './remoteTranscriptCache'
export { persistImportedTranscriptForPlaybackIdentity } from './remoteTranscriptPersistence'

export function getAsrSettingsSnapshot(): AsrSettingsSnapshot {
  const snapshot = getSettingsSnapshot()
  const effectiveModel = resolveAsrEffectiveModel(snapshot)
  return {
    asrProvider: snapshot.asrProvider as ASRProvider | '',
    asrModel: effectiveModel,
  }
}

/**
 * Resolves the stable identity URL for ASR (Identity Anchoring).
 * For downloaded episodes (blob:), returns the original remote URL.
 * For local files, returns the raw blob URL.
 */
export { resolveAsrIdentityUrl } from './remoteTranscriptRuntime'

async function resolveAsrApiKeyAndSettings(): Promise<
  | {
      ok: true
      asrProvider: ASRProvider
      asrModel: string
      apiKey: string
    }
  | {
      ok: false
      reasonCode?: AsrConfigErrorCode
    }
> {
  const settings = getAsrSettingsSnapshot()
  const selectionValidation = validateAsrProviderModelSelection({
    asrProvider: settings.asrProvider,
    asrModel: settings.asrModel,
  })
  if (!selectionValidation.ok) {
    return { ok: false, reasonCode: selectionValidation.code }
  }

  const apiKey = (await getCredential(getAsrCredentialKey(settings.asrProvider))).trim()
  if (!apiKey) return { ok: false }

  return {
    ok: true,
    asrProvider: selectionValidation.provider,
    asrModel: selectionValidation.model,
    apiKey,
  }
}

// Bypassing TanStack Router via pushState is brittle and can break with base path changes.
// We use a custom event to request navigation from the UI layer to avoid circular dependencies.
function navigateToSettingsAsrSection(): void {
  window.dispatchEvent(
    new CustomEvent('readio:navigate', {
      detail: { to: '/settings', hash: 'asr' },
    })
  )
}

async function tryApplyFingerprintCache(
  fingerprint: string,
  expectedAudioUrl: string,
  requestId: number
): Promise<boolean> {
  const cues = await findTranscriptCuesByFingerprint(fingerprint)
  if (!cues || !isTrackStillCurrent(expectedAudioUrl, requestId)) return false

  useTranscriptStore.getState().setSubtitles(cues)
  return true
}

export async function tryApplyCachedAsrTranscript(
  expectedAudioUrl: string,
  localTrackId: string | null,
  requestId: number
): Promise<boolean> {
  const cues = await findStoredTranscriptCues(expectedAudioUrl, localTrackId)
  if (!cues || !isTrackStillCurrent(expectedAudioUrl, requestId)) return false

  useTranscriptStore.getState().setSubtitles(cues)
  return true
}

function handleAsrFailure(
  error: unknown,
  _trigger: OnlineAsrTrigger
): { status: 'idle' | 'failed'; error: { code: string; message: string } | null } {
  if (error instanceof AudioDownloadError) {
    return {
      status: 'failed',
      error: { code: error.code, message: error.message },
    }
  }

  const asrError =
    error instanceof ASRClientError
      ? error
      : new ASRClientError('Unknown ASR failure', 'network_error')

  if (asrError.code === 'aborted') {
    log('[asr] aborted')
    return { status: 'idle', error: null }
  }

  // Map codes to user-friendly messages if needed, or use the error message
  const errorPayload = {
    code: asrError.code,
    message: asrError.message,
  }

  if (asrError.code === 'network_error') {
    log('[asr] network failure', asrError.message)
    return { status: 'failed', error: errorPayload }
  }

  if (asrError.code === 'unauthorized') {
    // Keep toast for unauthorized as it requires setting intervention
    toast.errorKey('asrKeyInvalid')
    navigateToSettingsAsrSection()
    return { status: 'failed', error: errorPayload }
  }

  // For other errors, we rely on the component UI to show the error
  // instead of spamming toasts
  log('[asr] task failed', asrError.code, asrError.message)

  return { status: 'failed', error: errorPayload }
}

const inFlightAsrTasks = new Set<string>()
const asrProviderCooldowns = new Map<ASRProvider, number>()

const { startOnlineASRForTrack } = createRemoteTranscriptOnlineAsrHandlers({
  inFlightAsrTasks,
  asrProviderCooldowns,
  buildAsrTrackKey,
  isTrackStillCurrent,
  resolveAsrApiKeyAndSettings,
  clearAsrStateForTrack,
  tryApplyCachedAsrTranscript,
  fetchTrackAudioBlob,
  computeAsrFingerprint,
  tryApplyFingerprintCache,
  persistAsrResult,
  handleAsrFailure,
  scheduleBestEffortRemoteAutoSave: ({
    audioBlob,
    expectedAudioUrl,
    trackKey,
    episodeMetadata,
    audioTitle,
  }) => {
    const canonicalRemoteSource = resolveCanonicalRemotePlaybackSource({
      audioUrl: expectedAudioUrl,
      metadata: episodeMetadata,
    })
    if (!canonicalRemoteSource) return

    const downloadOptions = buildDownloadJobOptionsFromCanonicalRemoteMetadata({
      audioUrl: canonicalRemoteSource.audioUrl,
      episodeTitle: audioTitle,
      metadata: canonicalRemoteSource.metadata,
    })
    if (!downloadOptions) return

    void persistAudioBlobAsDownload(audioBlob, downloadOptions)
      .then((result) => {
        if (result.ok) {
          log('[asr] auto-save persisted download', { trackKey, trackId: result.trackId })
        }
      })
      .catch((error) => warn('[asr] auto-save failed', error))
  },
})

export function startOnlineASRForCurrentTrack(trigger: OnlineAsrTrigger = 'manual'): void {
  const state = getPlayerStoreStateSafe()
  if (!state) return

  const identityUrl = resolveAsrIdentityUrl(state.audioUrl, state.episodeMetadata)
  if (!identityUrl) return

  void startOnlineASRForTrack({
    expectedAudioUrl: identityUrl,
    requestId: state.loadRequestId,
    localTrackId: state.localTrackId,
    trigger,
  })
}
const {
  retranscribeDownloadedTrackWithCurrentSettings,
  retranscribeFileTrackWithCurrentSettings,
} = createRemoteTranscriptRetranscriptionHandlers({
  inFlightAsrTasks,
  asrProviderCooldowns,
  buildAsrTrackKey,
  resolveAsrApiKeyAndSettings,
  formatAsrSubtitleName,
  fetchTrackAudioBlob,
  computeAsrFingerprint,
  handleAsrFailure,
  applyRetranscribedCuesToCurrentTrack,
})

export { retranscribeDownloadedTrackWithCurrentSettings, retranscribeFileTrackWithCurrentSettings }
export const autoIngestEpisodeTranscript = createRemoteTranscriptAutoIngestHandler({
  getPlayerStoreStateSafe,
  getValidTranscriptUrl,
  loadRemoteTranscriptWithCache,
  resolveAsrIdentityUrl,
  startOnlineASRForTrack,
})

export function __resetRemoteTranscriptStateForTests(): void {
  __resetRemoteTranscriptResourceStateForTests()
  inFlightAsrTasks.clear()
  asrProviderCooldowns.clear()
}
