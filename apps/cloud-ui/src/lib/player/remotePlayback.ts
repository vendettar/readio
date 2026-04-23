import type { EpisodeMetadata } from '../../store/playerStore'
import { TRANSCRIPT_INGESTION_STATUS, useTranscriptStore } from '../../store/transcriptStore'
import { getAsrCredentialKey, getCredential } from '../db/credentialsRepository'
import type { Favorite, PlaybackSession } from '../dexieDb'
import type { FeedEpisode, Podcast, SearchEpisode } from '../discovery'
import { downloadEpisode, removeDownloadedTrack } from '../downloadService'
import { log, logError } from '../logger'
import {
  autoIngestEpisodeTranscript,
  getAsrSettingsSnapshot,
  getValidTranscriptUrl,
} from '../remoteTranscript'
import { PlaybackRepository } from '../repositories/PlaybackRepository'
import { normalizeCountryParam } from '../routes/podcastRoutes'
import { DEFAULTS } from '../runtimeConfig.defaults'
import {
  mapFavoriteToPlaybackPayload,
  mapFeedEpisodeToPlaybackPayload,
  mapSearchEpisodeToPlaybackPayload,
  mapSessionToPlaybackPayload,
} from './episodeMetadata'
import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from './playbackMode'
import { resolvePlaybackSource } from './playbackSource'

type MetadataPatch = {
  countryAtSave?: string
}

type PlaybackModeOptions = {
  mode?: PlaybackRequestMode
}

type RemotePlaybackPayload = {
  audioUrl: string
  title: string
  artwork: string
  metadata: EpisodeMetadata
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
export type PlaybackStartResult =
  | { started: true; reason: typeof PLAYBACK_START_REASON.STARTED }
  | { started: false; reason: PlaybackNonStartReason }

const UNTITLED_PLAYBACK_TITLE = 'Untitled'

type SetAudioUrl = (
  url: string | null,
  title?: string,
  coverArt?: string | Blob | null,
  metadata?: EpisodeMetadata | null,
  isPlaying?: boolean
) => void

export interface RemotePlaybackDeps {
  setAudioUrl: SetAudioUrl
  play: () => void
  pause: () => void
  setSessionId?: (id: string | null) => void
  setPlaybackTrackId?: (id: string | null) => void
}

export interface RemoteStreamTargetCandidates {
  sourceUrlNormalized?: string | null
  audioUrl?: string | null
}

type PlaybackSourceResolution =
  | {
      ok: true
      source: { url: string; trackId?: string }
    }
  | {
      ok: false
      reason: PlaybackNonStartReason
    }

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

function mergeMetadata(metadata: EpisodeMetadata, patch?: MetadataPatch): EpisodeMetadata {
  if (!patch?.countryAtSave) return metadata
  return {
    ...metadata,
    countryAtSave: patch.countryAtSave,
  }
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

async function resolveSourceForPlaybackMode(
  currentEpoch: number,
  mode: PlaybackRequestMode,
  audioUrl: string,
  streamTarget?: RemoteStreamTargetCandidates
): Promise<PlaybackSourceResolution> {
  const resolved = await resolvePlaybackSource(audioUrl)
  if (isEpochStale(currentEpoch)) {
    return { ok: false, reason: PLAYBACK_START_REASON.STALE }
  }

  if (mode !== PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT) {
    return { ok: true, source: resolved }
  }

  if (resolved.url.startsWith('blob:')) {
    return { ok: true, source: resolved }
  }

  const remoteTarget = resolveRemoteStreamTargetUrl(streamTarget ?? { audioUrl })
  if (!remoteTarget) {
    return { ok: false, reason: PLAYBACK_START_REASON.NO_PLAYABLE_SOURCE }
  }

  return { ok: true, source: { url: remoteTarget } }
}

/**
 * Checks if ASR is fully configured (provider + model).
 * Note: Does not check API key presence as that is async (DB).
 */
function isAsrConfigured(): boolean {
  const settings = getAsrSettingsSnapshot()
  return !!settings.asrProvider && !!settings.asrModel
}

/**
 * Checks whether the given source requires ASR-blocking download.
 * Returns true if: source is remote (not blob:), no transcript URL exists,
 * and provider/model/key are configured.
 */
async function needsAsrDownloadBlocking(
  source: { url: string },
  transcriptUrl?: string
): Promise<boolean> {
  if (source.url.startsWith('blob:')) return false
  if (transcriptUrl) return false
  if (!isAsrConfigured()) return false

  const settings = getAsrSettingsSnapshot()
  const provider = settings.asrProvider
  if (!provider) return false

  const apiKey = (await getCredential(getAsrCredentialKey(provider))).trim()
  return !!apiKey
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
    metadata: EpisodeMetadata
  },
  isRetry = false
): Promise<{ url: string; trackId?: string } | null> {
  useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.LOADING)

  const res = await downloadEpisode({
    audioUrl: payload.audioUrl,
    episodeTitle: payload.title,
    episodeDescription: payload.metadata.description,
    showTitle: payload.metadata.showTitle || '',
    feedUrl: payload.metadata.podcastFeedUrl,
    artworkUrl: payload.artwork,
    podcastItunesId: payload.metadata.podcastItunesId,
    episodeGuid: payload.metadata.episodeGuid,
    durationSeconds: payload.metadata.durationSeconds,
    countryAtSave:
      normalizeCountryParam(payload.metadata.countryAtSave) ?? DEFAULTS.DEFAULT_COUNTRY,
    signal: currentPlaybackAbortController?.signal,
  })

  if (currentEpoch !== getPlaybackEpoch()) return null
  if (!res.ok) return null

  const newSource = await resolvePlaybackSource(payload.audioUrl)
  if (currentEpoch !== getPlaybackEpoch()) return null

  // Mandatory local-blob check for ASR-ready paths (Instruction 127)
  // If resolvePlaybackSource returned a non-blob URL but we have a trackId, it means the blob is missing (dirty track).
  if (!newSource.url.startsWith('blob:') && newSource.trackId) {
    if (isRetry) {
      logError('[remotePlayback] downloadAndResolve failed even after retry.')
      return null
    }

    log(
      '[remotePlayback] Detected dirty track (metadata exists but blob missing). Cleaning up and retrying...',
      {
        trackId: newSource.trackId,
      }
    )

    // Race protection: ensure epoch hasn't changed before destructive cleanup (Instruction 20260228-R2)
    if (currentEpoch !== getPlaybackEpoch()) return null
    await removeDownloadedTrack(newSource.trackId)
    if (currentEpoch !== getPlaybackEpoch()) return null

    // Second chance: retry the download flow now that the dirty record is purged
    return downloadAndResolve(currentEpoch, payload, true)
  }

  return newSource
}

async function playRemotePayload(
  deps: RemotePlaybackDeps,
  payload: RemotePlaybackPayload,
  patch?: MetadataPatch,
  options?: PlaybackModeOptions
): Promise<PlaybackStartResult> {
  const mode = options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT
  return runPlaybackFlow(deps, payload, {
    mode,
    patch,
    onReadyToPlay: ({ source, isStreamWithoutTranscript }) => {
      if (isStreamWithoutTranscript) {
        deps.setPlaybackTrackId?.(null)
      } else if (source.trackId) {
        deps.setPlaybackTrackId?.(source.trackId)
      }
    },
  })
}

export async function playFeedEpisodeWithDeps(
  deps: RemotePlaybackDeps,
  episode: FeedEpisode,
  podcast: Podcast,
  options?: MetadataPatch & PlaybackModeOptions
): Promise<void> {
  const payload = mapFeedEpisodeToPlaybackPayload(episode, podcast)
  await playRemotePayload(deps, payload, options, options)
}

export async function playSearchEpisodeWithDeps(
  deps: RemotePlaybackDeps,
  episode: SearchEpisode,
  options?: { podcastFeedUrl?: string; countryAtSave?: string; mode?: PlaybackRequestMode }
): Promise<void> {
  const payload = mapSearchEpisodeToPlaybackPayload(episode, options?.podcastFeedUrl)
  await playRemotePayload(deps, payload, options, options)
}

export async function playFavoriteWithDeps(
  deps: RemotePlaybackDeps,
  favorite: Favorite,
  options?: MetadataPatch & PlaybackModeOptions
): Promise<void> {
  const payload = mapFavoriteToPlaybackPayload(favorite)
  await playRemotePayload(deps, payload, options, options)
}

export async function playStreamWithoutTranscriptWithDeps(
  deps: RemotePlaybackDeps,
  payload: {
    streamTarget: RemoteStreamTargetCandidates
    title: string
    artwork: string
    metadata: EpisodeMetadata
  },
  patch?: MetadataPatch
): Promise<PlaybackStartResult> {
  const audioUrl =
    payload.streamTarget.sourceUrlNormalized?.trim() || payload.streamTarget.audioUrl?.trim() || ''
  if (!audioUrl) {
    return createNonStartedResult(PLAYBACK_START_REASON.NO_PLAYABLE_SOURCE)
  }

  return playRemotePayload(
    deps,
    {
      audioUrl,
      title: payload.title,
      artwork: payload.artwork,
      metadata: payload.metadata,
      streamTarget: payload.streamTarget,
    },
    patch,
    {
      mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
    }
  )
}

export async function playHistorySessionWithDeps(
  deps: RemotePlaybackDeps,
  session: PlaybackSession,
  options?: PlaybackModeOptions
): Promise<boolean> {
  const payload = mapSessionToPlaybackPayload(session)
  if (!payload) return false

  const mode = options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT
  const startResult = await runPlaybackFlow(deps, payload, {
    mode,
    onReadyToPlay: async ({ source, isStreamWithoutTranscript }) => {
      let finalTrackId = source.trackId
      if (isStreamWithoutTranscript) {
        deps.setPlaybackTrackId?.(null)
      } else if (!finalTrackId && session.localTrackId) {
        const trackExists = await PlaybackRepository.trackExists(session.localTrackId)
        if (trackExists) {
          finalTrackId = session.localTrackId
        }
      }

      if (finalTrackId) {
        deps.setPlaybackTrackId?.(finalTrackId)
      }
      deps.setSessionId?.(session.id)
    },
  })
  return startResult.started
}

type PlaybackReadyContext = {
  source: { url: string; trackId?: string }
  isStreamWithoutTranscript: boolean
  metadata: EpisodeMetadata
  playableTitle: string
}

async function runPlaybackFlow(
  deps: RemotePlaybackDeps,
  payload: RemotePlaybackPayload,
  options: {
    mode: PlaybackRequestMode
    patch?: MetadataPatch
    onReadyToPlay?: (ctx: PlaybackReadyContext) => void | Promise<void>
  }
): Promise<PlaybackStartResult> {
  const mode = options.mode
  const isStreamWithoutTranscript = mode === PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT
  const transcriptSourceUrl = !isStreamWithoutTranscript
    ? getValidTranscriptUrl(payload.transcriptUrl)
    : null
  const hasTranscriptSource = transcriptSourceUrl !== null
  const currentEpoch = bumpPlaybackEpoch()

  const metadata = mergeMetadata(
    {
      ...payload.metadata,
      originalAudioUrl: payload.audioUrl,
      playbackRequestMode: mode,
    },
    options.patch
  )
  const playableTitle = resolvePlayableTitle(payload.title, metadata)

  deps.pause()
  if (hasTranscriptSource) {
    deps.setAudioUrl(null, playableTitle, payload.artwork, metadata, true)
    useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.LOADING)
  } else {
    deps.setAudioUrl(null, playableTitle, payload.artwork, metadata, true)
  }

  const sourceResolution = await resolveSourceForPlaybackMode(
    currentEpoch,
    mode,
    payload.audioUrl,
    payload.streamTarget
  )
  if (!sourceResolution.ok) {
    if (hasTranscriptSource && sourceResolution.reason !== PLAYBACK_START_REASON.STALE) {
      useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.IDLE)
    }
    if (sourceResolution.reason === PLAYBACK_START_REASON.NO_PLAYABLE_SOURCE) {
      deps.setAudioUrl(null)
    }
    return createNonStartedResult(sourceResolution.reason)
  }
  let source: { url: string; trackId?: string } = sourceResolution.source

  const shouldBlockForAsr =
    !isStreamWithoutTranscript &&
    !hasTranscriptSource &&
    (await needsAsrDownloadBlocking(source, transcriptSourceUrl || undefined))
  if (shouldBlockForAsr) {
    const downloadedSource = await downloadAndResolve(currentEpoch, payload)
    if (isEpochStale(currentEpoch)) {
      return createNonStartedResult(PLAYBACK_START_REASON.STALE)
    }

    if (!downloadedSource) {
      deps.setAudioUrl(null)
      return createNonStartedResult(PLAYBACK_START_REASON.DOWNLOAD_FAILED)
    }
    source = downloadedSource
  }

  if (isStreamWithoutTranscript) {
    useTranscriptStore.getState().resetTranscript()
  }

  deps.setAudioUrl(source.url, playableTitle, payload.artwork, metadata, true)
  await options.onReadyToPlay?.({ source, isStreamWithoutTranscript, metadata, playableTitle })
  if (isEpochStale(currentEpoch)) {
    return createNonStartedResult(PLAYBACK_START_REASON.STALE)
  }
  deps.play()

  if (!isStreamWithoutTranscript) {
    autoIngestEpisodeTranscript(transcriptSourceUrl || undefined, payload.audioUrl)
  }
  return createStartedResult()
}
