import { getValidTranscriptUrl } from '../remoteTranscript'
import type { SupportedCountry } from '../routes/podcastRoutes'
import {
  createCanonicalRemoteEpisodeMetadata,
  type CanonicalEpisodeMetadata,
  type CanonicalRemoteEpisodeMetadata,
  type EpisodeMetadata,
  type LocalEpisodeMetadata,
} from './playbackMetadata'
import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from './playbackMode'
import {
  createRemotePlaybackEntryPoints,
  type PlaybackStartResult,
  type RemotePlaybackDeps,
  type RemoteStreamTargetCandidates,
} from './remotePlaybackEntryPoints'
import {
  resolveDownloadedPlaybackSource,
  resolvePlayableSourceForPlayback,
} from './remotePlaybackSourceResolver'
import {
  applyPlaybackLoadingState,
  completePlaybackReadyState,
  handlePlaybackResolutionFailure,
} from './remotePlaybackFlowState'

type ManagedPlaybackPayload<TMetadata extends EpisodeMetadata = EpisodeMetadata> = {
  audioUrl: string
  title: string
  artwork: string
  metadata: TMetadata
  transcriptUrl?: string
  streamTarget?: RemoteStreamTargetCandidates
}

export const PLAYBACK_START_REASON = {
  STARTED: 'started',
  STALE: 'stale',
  NO_PLAYABLE_SOURCE: 'no_playable_source',
  DOWNLOAD_FAILED: 'download_failed',
} as const

export type PlaybackStartReason = (typeof PLAYBACK_START_REASON)[keyof typeof PLAYBACK_START_REASON]
type PlaybackNonStartReason = Exclude<PlaybackStartReason, typeof PLAYBACK_START_REASON.STARTED>

const UNTITLED_PLAYBACK_TITLE = 'Untitled'

function sanitizeRemoteUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

export function resolveRemoteStreamTargetUrl(
  candidates: RemoteStreamTargetCandidates
): string | null {
  return sanitizeRemoteUrl(candidates.sourceUrlNormalized) ?? sanitizeRemoteUrl(candidates.audioUrl)
}

export function hasStreamTargetForPlayback(candidates: RemoteStreamTargetCandidates): boolean {
  return !!resolveRemoteStreamTargetUrl(candidates)
}

export function canPlayRemoteStreamWithoutTranscript(
  candidates: RemoteStreamTargetCandidates,
  isOnline: boolean
): boolean {
  if (!isOnline) return false
  return hasStreamTargetForPlayback(candidates)
}

function decoratePlaybackMetadata(input: {
  metadata: EpisodeMetadata
  audioUrl: string
  mode: PlaybackRequestMode
}): EpisodeMetadata
function decoratePlaybackMetadata(input: {
  metadata: LocalEpisodeMetadata
  audioUrl: string
  mode: PlaybackRequestMode
}): LocalEpisodeMetadata
function decoratePlaybackMetadata(input: {
  metadata: CanonicalRemoteEpisodeMetadata
  audioUrl: string
  mode: PlaybackRequestMode
}): CanonicalRemoteEpisodeMetadata
function decoratePlaybackMetadata<TMetadata extends EpisodeMetadata>(input: {
  metadata: TMetadata
  audioUrl: string
  mode: PlaybackRequestMode
}): TMetadata {
  return {
    ...input.metadata,
    originalAudioUrl: input.audioUrl,
    playbackRequestMode: input.mode,
  } as TMetadata
}

function buildCanonicalRemotePlaybackMetadata(input: {
  metadata: CanonicalEpisodeMetadata
  audioUrl: string
  mode: PlaybackRequestMode
  countryAtSave: SupportedCountry
}): CanonicalRemoteEpisodeMetadata | null {
  return createCanonicalRemoteEpisodeMetadata({
    description: input.metadata.description,
    showTitle: input.metadata.showTitle,
    artworkUrl: input.metadata.artworkUrl,
    publishedAt: input.metadata.publishedAt,
    durationSeconds: input.metadata.durationSeconds,
    episodeGuid: input.metadata.episodeGuid,
    podcastItunesId: input.metadata.podcastItunesId,
    transcriptUrl: input.metadata.transcriptUrl,
    originalAudioUrl: input.audioUrl,
    playbackRequestMode: input.mode,
    countryAtSave: input.countryAtSave,
  })
}

function resolvePlayableTitle(title: string | undefined, metadata: EpisodeMetadata): string {
  const normalizedTitle = title?.trim()
  if (normalizedTitle) return normalizedTitle
  const fallbackShowTitle = metadata.showTitle?.trim()
  if (fallbackShowTitle) return fallbackShowTitle
  return UNTITLED_PLAYBACK_TITLE
}

// Latest-request-wins protection (Instruction 124 refinement)
let globalPlaybackEpoch = 0
let currentPlaybackAbortController: AbortController | null = null

export const getPlaybackEpoch = () => globalPlaybackEpoch
export const bumpPlaybackEpoch = () => {
  globalPlaybackEpoch++
  currentPlaybackAbortController?.abort('stale_request')
  currentPlaybackAbortController = new AbortController()
  return globalPlaybackEpoch
}

function createStartedResult(): PlaybackStartResult {
  return { started: true, reason: PLAYBACK_START_REASON.STARTED }
}

function createNonStartedResult(reason: PlaybackNonStartReason): PlaybackStartResult {
  return { started: false, reason }
}

function isEpochStale(epoch: number): boolean {
  return epoch !== globalPlaybackEpoch
}

/**
 * Downloads the episode audio and returns the resolved local source.
 * Returns null if download failed or was cancelled.
 */
export async function downloadAndResolve(
  currentEpoch: number,
  payload: {
    audioUrl: string
    title: string
    artwork: string
    metadata: CanonicalRemoteEpisodeMetadata
  },
  isRetry = false
): Promise<{ url: string; trackId?: string } | null> {
  return resolveDownloadedPlaybackSource({
    currentEpoch,
    getPlaybackEpoch,
    isEpochStale,
    abortSignal: currentPlaybackAbortController?.signal,
    payload,
    isRetry,
  })
}

const {
  playEpisodeWithDeps,
  playSearchEpisodeWithDeps,
  playFavoriteWithDeps,
  playStreamWithoutTranscriptWithDeps,
  playHistorySessionWithDeps,
} = createRemotePlaybackEntryPoints({
  buildCanonicalRemotePlaybackMetadata,
  createNonStartedResult,
  hasStreamTargetForPlayback,
  resolveRemoteStreamTargetUrl,
  runPlaybackFlow,
})

export {
  playEpisodeWithDeps,
  playFavoriteWithDeps,
  playHistorySessionWithDeps,
  playSearchEpisodeWithDeps,
  playStreamWithoutTranscriptWithDeps,
}

type PlaybackReadyContext = {
  source: { url: string; trackId?: string }
  isStreamWithoutTranscript: boolean
  metadata: EpisodeMetadata
  playableTitle: string
}

async function runPlaybackFlow(
  deps: RemotePlaybackDeps,
  payload: ManagedPlaybackPayload<EpisodeMetadata>,
  options: {
    mode: PlaybackRequestMode
    onReadyToPlay?: (ctx: PlaybackReadyContext) => void | Promise<void>
  }
): Promise<PlaybackStartResult>
async function runPlaybackFlow(
  deps: RemotePlaybackDeps,
  payload: ManagedPlaybackPayload<CanonicalRemoteEpisodeMetadata>,
  options: {
    mode: PlaybackRequestMode
    onReadyToPlay?: (ctx: PlaybackReadyContext) => void | Promise<void>
  }
): Promise<PlaybackStartResult>
async function runPlaybackFlow(
  deps: RemotePlaybackDeps,
  payload: ManagedPlaybackPayload<LocalEpisodeMetadata>,
  options: {
    mode: PlaybackRequestMode
    onReadyToPlay?: (ctx: PlaybackReadyContext) => void | Promise<void>
  }
): Promise<PlaybackStartResult>
async function runPlaybackFlow<TMetadata extends EpisodeMetadata>(
  deps: RemotePlaybackDeps,
  payload: ManagedPlaybackPayload<TMetadata>,
  options: {
    mode: PlaybackRequestMode
    onReadyToPlay?: (ctx: PlaybackReadyContext & { metadata: TMetadata }) => void | Promise<void>
  }
): Promise<PlaybackStartResult> {
  const mode = options.mode
  const isStreamWithoutTranscript = mode === PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT
  const transcriptSourceUrl = !isStreamWithoutTranscript
    ? getValidTranscriptUrl(payload.transcriptUrl)
    : null
  const hasTranscriptSource = transcriptSourceUrl !== null
  const currentEpoch = bumpPlaybackEpoch()

  const metadata = decoratePlaybackMetadata({
    metadata: payload.metadata,
    audioUrl: payload.audioUrl,
    mode,
  }) as TMetadata
  const playableTitle = resolvePlayableTitle(payload.title, metadata)

  deps.pause()
  applyPlaybackLoadingState({
    deps,
    playableTitle,
    artwork: payload.artwork,
    metadata,
    hasTranscriptSource,
  })

  const sourceResolution = await resolvePlayableSourceForPlayback({
    currentEpoch,
    getPlaybackEpoch,
    isEpochStale,
    abortSignal: currentPlaybackAbortController?.signal,
    mode,
    audioUrl: payload.audioUrl,
    title: payload.title,
    artwork: payload.artwork,
    metadata,
    transcriptUrl: transcriptSourceUrl || undefined,
    streamTarget: payload.streamTarget,
    resolveRemoteStreamTargetUrl,
  })
  if (!sourceResolution.ok) {
    handlePlaybackResolutionFailure({
      deps,
      reason: sourceResolution.reason,
      hasTranscriptSource,
    })
    return createNonStartedResult(sourceResolution.reason)
  }
  const source: { url: string; trackId?: string } = sourceResolution.source

  await completePlaybackReadyState({
    deps,
    source,
    playableTitle,
    artwork: payload.artwork,
    metadata,
    isStreamWithoutTranscript,
    transcriptSourceUrl,
    originalAudioUrl: payload.audioUrl,
    onReadyToPlay: options.onReadyToPlay,
  })
  if (isEpochStale(currentEpoch)) {
    return createNonStartedResult(PLAYBACK_START_REASON.STALE)
  }
  return createStartedResult()
}
