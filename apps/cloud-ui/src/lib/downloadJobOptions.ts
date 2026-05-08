import {
  buildCanonicalDownloadRequestKey,
  type CanonicalEpisodeDownloadLookupInput,
  type EpisodeDownloadLookupInput,
  resolveDownloadLookup,
} from './downloadLookupResolver'
import { normalizePodcastAudioUrl } from './networking/urlUtils'
import type { CanonicalRemoteEpisodeMetadata } from './player/playbackMetadata'
import { getValidTranscriptUrl } from './remoteTranscript'
import { normalizeCountryParam } from './routes/podcastRoutes'

export interface EpisodeDownloadProps {
  episodeTitle: string
  episodeDescription?: string
  showTitle: string
  audioUrl: string
  transcriptUrl?: string
  artworkUrl: string
  countryAtSave: string
  podcastItunesId: string
  episodeGuid: string
  durationSeconds?: number
}

export interface DownloadProgress {
  loadedBytes: number
  totalBytes: number | null
  percent: number | null
  speedBytesPerSecond?: number
}

export interface DownloadJobOptions {
  audioUrl: string
  episodeTitle: string
  episodeDescription: string
  showTitle: string
  artworkUrl: string
  silent?: boolean
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
  countryAtSave: string
  podcastItunesId: string
  episodeGuid: string
  durationSeconds?: number
  transcriptUrl?: string
}

export interface RemoteMetadataDownloadInput {
  audioUrl: string
  episodeTitle: string
  metadata: CanonicalRemoteEpisodeMetadata
  silent?: boolean
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
}

export type EpisodePropsDownloadInput = EpisodeDownloadProps

type DownloadNormalizationFailureReason = 'network_error' | 'invalid_country'

interface NormalizedDownloadRequiredFields {
  audioUrl: string
  episodeTitle: string
  showTitle: string
  artworkUrl: string
  countryAtSave: string
  podcastItunesId: string
  episodeGuid: string
}

type NormalizedDownloadRequiredFieldsResult =
  | { ok: true; fields: NormalizedDownloadRequiredFields }
  | { ok: false; reason: DownloadNormalizationFailureReason }

export type NormalizedDownloadJobOptionsResult =
  | { ok: true; options: DownloadJobOptions; normalizedAudioUrl: string }
  | { ok: false; reason: DownloadNormalizationFailureReason }

function normalizeRequiredDownloadField(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function resolveEpisodeDownloadStatusKey(
  input: EpisodeDownloadLookupInput | CanonicalEpisodeDownloadLookupInput
): string | null {
  return resolveDownloadLookup(input).statusKey
}

function normalizeDownloadRequiredFields(input: {
  audioUrl: string
  episodeTitle: string
  showTitle: string
  artworkUrl: string
  countryAtSave: string
  podcastItunesId: string
  episodeGuid: string
}): NormalizedDownloadRequiredFieldsResult {
  const audioUrl = normalizeRequiredDownloadField(input.audioUrl)
  const episodeTitle = normalizeRequiredDownloadField(input.episodeTitle)
  const showTitle = normalizeRequiredDownloadField(input.showTitle)
  const artworkUrl = normalizeRequiredDownloadField(input.artworkUrl)
  const podcastItunesId = normalizeRequiredDownloadField(input.podcastItunesId)
  const episodeGuid = normalizeRequiredDownloadField(input.episodeGuid)
  const countryAtSave = normalizeCountryParam(input.countryAtSave)

  if (!countryAtSave) {
    return { ok: false, reason: 'invalid_country' }
  }

  if (!audioUrl || !episodeTitle || !showTitle || !artworkUrl || !podcastItunesId || !episodeGuid) {
    return { ok: false, reason: 'network_error' }
  }

  return {
    ok: true,
    fields: {
      audioUrl,
      episodeTitle,
      showTitle,
      artworkUrl,
      countryAtSave,
      podcastItunesId,
      episodeGuid,
    },
  }
}

function buildDownloadJobOptions(input: {
  audioUrl: string
  episodeTitle: string
  description?: string
  showTitle: string
  artworkUrl: string
  transcriptUrl?: string
  countryAtSave: string
  podcastItunesId: string
  episodeGuid: string
  durationSeconds?: number
  silent?: boolean
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
}): DownloadJobOptions | null {
  const normalized = normalizeDownloadRequiredFields({
    audioUrl: input.audioUrl,
    episodeTitle: input.episodeTitle,
    showTitle: input.showTitle,
    artworkUrl: input.artworkUrl,
    countryAtSave: input.countryAtSave,
    podcastItunesId: input.podcastItunesId,
    episodeGuid: input.episodeGuid,
  })
  if (!normalized.ok) {
    return null
  }

  const {
    audioUrl,
    episodeTitle,
    showTitle,
    artworkUrl,
    countryAtSave,
    podcastItunesId,
    episodeGuid,
  } = normalized.fields

  return {
    audioUrl,
    episodeTitle,
    episodeDescription: input.description ?? '',
    showTitle,
    artworkUrl,
    silent: input.silent,
    signal: input.signal,
    onProgress: input.onProgress,
    countryAtSave,
    podcastItunesId,
    episodeGuid,
    durationSeconds: input.durationSeconds,
    transcriptUrl: getValidTranscriptUrl(input.transcriptUrl) ?? undefined,
  }
}

export function buildDownloadJobOptionsFromCanonicalRemoteMetadata(
  input: RemoteMetadataDownloadInput
): DownloadJobOptions | null {
  return buildDownloadJobOptions({
    audioUrl: input.audioUrl,
    episodeTitle: input.episodeTitle,
    description: input.metadata.description,
    showTitle: input.metadata.showTitle,
    artworkUrl: input.metadata.artworkUrl,
    transcriptUrl: input.metadata.transcriptUrl,
    countryAtSave: input.metadata.countryAtSave,
    podcastItunesId: input.metadata.podcastItunesId,
    episodeGuid: input.metadata.episodeGuid,
    durationSeconds: input.metadata.durationSeconds,
    silent: input.silent,
    signal: input.signal,
    onProgress: input.onProgress,
  })
}

export function buildDownloadJobOptionsFromEpisodeProps(
  input: EpisodePropsDownloadInput
): DownloadJobOptions | null {
  return buildDownloadJobOptions({
    audioUrl: input.audioUrl,
    episodeTitle: input.episodeTitle,
    description: input.episodeDescription,
    showTitle: input.showTitle,
    artworkUrl: input.artworkUrl,
    transcriptUrl: input.transcriptUrl,
    countryAtSave: input.countryAtSave,
    podcastItunesId: input.podcastItunesId,
    episodeGuid: input.episodeGuid,
    durationSeconds: input.durationSeconds,
  })
}

export function normalizeDownloadJobOptions(
  input: DownloadJobOptions
): NormalizedDownloadJobOptionsResult {
  const normalized = normalizeDownloadRequiredFields(input)
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason }
  }

  const normalizedAudioUrl = normalizePodcastAudioUrl(normalized.fields.audioUrl)
  if (!normalizedAudioUrl) {
    return { ok: false, reason: 'network_error' }
  }

  return {
    ok: true,
    normalizedAudioUrl,
    options: {
      ...input,
      ...normalized.fields,
      transcriptUrl: getValidTranscriptUrl(input.transcriptUrl) ?? undefined,
    },
  }
}

export function buildDownloadProgressStatusKey(options: {
  audioUrl: string
  podcastItunesId: string
  episodeGuid: string
}): string {
  return (
    resolveDownloadLookup(options).statusKey ??
    buildCanonicalDownloadRequestKey(options.podcastItunesId, options.episodeGuid)
  )
}
