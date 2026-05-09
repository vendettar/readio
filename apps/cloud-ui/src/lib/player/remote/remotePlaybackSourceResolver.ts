import { TRANSCRIPT_INGESTION_STATUS, useTranscriptStore } from '../../../store/transcriptStore'
import {
  buildDownloadJobOptionsFromCanonicalRemoteMetadata,
  downloadEpisode,
  removeDownloadedTrack,
} from '../../downloadService'
import { log, logError } from '../../logger'
import { getAsrSettingsSnapshot } from '../../remoteTranscript'
import { CredentialsRepository } from '../../repositories/CredentialsRepository'
import {
  type CanonicalRemoteEpisodeMetadata,
  type EpisodeMetadata,
  isCanonicalRemoteEpisodeMetadata,
} from '../playbackMetadata'
import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from '../playbackMode'
import { resolvePlaybackSource } from '../playbackSource'

type RemoteStreamTargetCandidates = {
  sourceUrlNormalized?: string | null
  audioUrl?: string | null
}

export type ResolvedPlaybackSource = {
  url: string
  trackId?: string
}

export type PlaybackSourceFailureReason = 'stale' | 'no_playable_source' | 'download_failed'

export type PlaybackSourceResolution =
  | {
      ok: true
      source: ResolvedPlaybackSource
    }
  | {
      ok: false
      reason: Exclude<PlaybackSourceFailureReason, 'download_failed'>
    }

type EpochDeps = {
  currentEpoch: number
  getPlaybackEpoch: () => number
  isEpochStale: (epoch: number) => boolean
  abortSignal?: AbortSignal | null
}

type DownloadAndResolveInput = EpochDeps & {
  payload: {
    audioUrl: string
    title: string
    artwork: string
    metadata: CanonicalRemoteEpisodeMetadata
  }
  isRetry?: boolean
}

type ResolvePlayableSourceInput = EpochDeps & {
  mode: PlaybackRequestMode
  audioUrl: string
  title: string
  artwork: string
  metadata: EpisodeMetadata
  transcriptUrl?: string
  streamTarget?: RemoteStreamTargetCandidates
  resolveRemoteStreamTargetUrl: (candidates: RemoteStreamTargetCandidates) => string | null
}

function isAsrConfigured(): boolean {
  const settings = getAsrSettingsSnapshot()
  return !!settings.asrProvider && !!settings.asrModel
}

async function needsAsrDownloadBlocking(
  source: ResolvedPlaybackSource,
  transcriptUrl?: string
): Promise<boolean> {
  if (source.url.startsWith('blob:')) return false
  if (transcriptUrl) return false
  if (!isAsrConfigured()) return false

  const settings = getAsrSettingsSnapshot()
  const provider = settings.asrProvider
  if (!provider) return false

  const apiKey = (
    await CredentialsRepository.get(CredentialsRepository.getAsrCredentialKey(provider))
  ).trim()
  return !!apiKey
}

async function resolveSourceForPlaybackMode(
  input: Pick<
    ResolvePlayableSourceInput,
    | 'currentEpoch'
    | 'mode'
    | 'audioUrl'
    | 'streamTarget'
    | 'resolveRemoteStreamTargetUrl'
    | 'isEpochStale'
  >
): Promise<PlaybackSourceResolution> {
  const resolved = await resolvePlaybackSource(input.audioUrl)
  if (input.isEpochStale(input.currentEpoch)) {
    return { ok: false, reason: 'stale' }
  }

  if (input.mode !== PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT) {
    return { ok: true, source: resolved }
  }

  if (resolved.url.startsWith('blob:')) {
    return { ok: true, source: resolved }
  }

  const remoteTarget = input.resolveRemoteStreamTargetUrl(
    input.streamTarget ?? { audioUrl: input.audioUrl }
  )
  if (!remoteTarget) {
    return { ok: false, reason: 'no_playable_source' }
  }

  return { ok: true, source: { url: remoteTarget } }
}

export async function resolveDownloadedPlaybackSource(
  input: DownloadAndResolveInput
): Promise<ResolvedPlaybackSource | null> {
  const downloadOptions = buildDownloadJobOptionsFromCanonicalRemoteMetadata({
    audioUrl: input.payload.audioUrl,
    episodeTitle: input.payload.title,
    metadata: input.payload.metadata,
    signal: input.abortSignal ?? undefined,
  })
  if (!downloadOptions) return null

  const result = await downloadEpisode(downloadOptions)

  if (input.currentEpoch !== input.getPlaybackEpoch()) return null
  if (!result.ok) return null

  const newSource = await resolvePlaybackSource(input.payload.audioUrl)
  if (input.currentEpoch !== input.getPlaybackEpoch()) return null

  if (!newSource.url.startsWith('blob:') && newSource.trackId) {
    if (input.isRetry) {
      logError('[remotePlayback] downloadAndResolve failed even after retry.')
      return null
    }

    log(
      '[remotePlayback] Detected dirty track (metadata exists but blob missing). Cleaning up and retrying...',
      {
        trackId: newSource.trackId,
      }
    )

    if (input.currentEpoch !== input.getPlaybackEpoch()) return null
    await removeDownloadedTrack(newSource.trackId)
    if (input.currentEpoch !== input.getPlaybackEpoch()) return null

    return resolveDownloadedPlaybackSource({
      ...input,
      isRetry: true,
    })
  }

  return newSource
}

export async function resolvePlayableSourceForPlayback(input: ResolvePlayableSourceInput): Promise<
  | {
      ok: true
      source: ResolvedPlaybackSource
      didEnterTranscriptIngestionLoadingState: boolean
    }
  | {
      ok: false
      reason: PlaybackSourceFailureReason
      didEnterTranscriptIngestionLoadingState: boolean
    }
> {
  const sourceResolution = await resolveSourceForPlaybackMode(input)
  if (!sourceResolution.ok) {
    return {
      ...sourceResolution,
      didEnterTranscriptIngestionLoadingState: false,
    }
  }

  let source = sourceResolution.source
  const shouldBlockForAsr =
    input.mode !== PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT &&
    (await needsAsrDownloadBlocking(source, input.transcriptUrl))

  if (!shouldBlockForAsr) {
    return { ok: true, source, didEnterTranscriptIngestionLoadingState: false }
  }

  if (!isCanonicalRemoteEpisodeMetadata(input.metadata)) {
    return { ok: false, reason: 'download_failed', didEnterTranscriptIngestionLoadingState: false }
  }

  useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.LOADING)

  const downloadedSource = await resolveDownloadedPlaybackSource({
    currentEpoch: input.currentEpoch,
    getPlaybackEpoch: input.getPlaybackEpoch,
    isEpochStale: input.isEpochStale,
    abortSignal: input.abortSignal,
    payload: {
      audioUrl: input.audioUrl,
      title: input.title,
      artwork: input.artwork,
      metadata: input.metadata,
    },
  })
  if (input.isEpochStale(input.currentEpoch)) {
    return { ok: false, reason: 'stale', didEnterTranscriptIngestionLoadingState: true }
  }

  if (!downloadedSource) {
    return { ok: false, reason: 'download_failed', didEnterTranscriptIngestionLoadingState: true }
  }

  source = downloadedSource
  return { ok: true, source, didEnterTranscriptIngestionLoadingState: true }
}
