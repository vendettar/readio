import { normalizeCountryParam, type SupportedCountry } from '../routes/podcastRoutes'
import type { PlaybackRequestMode } from './playbackMode'

export const PLAYBACK_METADATA_KIND = {
  LOCAL: 'local',
  REMOTE_EPISODE: 'remote-episode',
} as const

type PlaybackMetadataKind =
  (typeof PLAYBACK_METADATA_KIND)[keyof typeof PLAYBACK_METADATA_KIND]

interface SharedEpisodeMetadataInput {
  kind?: PlaybackMetadataKind
  description?: string
  showTitle?: string
  transcriptUrl?: string
  artworkUrl?: string
  publishedAt?: number
  durationSeconds?: number
  originalAudioUrl?: string
  playbackRequestMode?: PlaybackRequestMode
}

interface SharedNormalizedEpisodeMetadata {
  description?: string
  showTitle?: string
  transcriptUrl?: string
  artworkUrl?: string
  publishedAt?: number
  durationSeconds?: number
  originalAudioUrl?: string
  playbackRequestMode?: PlaybackRequestMode
}

export interface LocalEpisodeMetadata extends SharedNormalizedEpisodeMetadata {
  kind: typeof PLAYBACK_METADATA_KIND.LOCAL
  countryAtSave?: undefined
  episodeGuid?: undefined
  podcastItunesId?: undefined
}

interface LocalEpisodeMetadataInput extends SharedEpisodeMetadataInput {
  kind?: typeof PLAYBACK_METADATA_KIND.LOCAL
  countryAtSave?: undefined
  episodeGuid?: undefined
  podcastItunesId?: undefined
}

export interface CanonicalEpisodeMetadata extends SharedNormalizedEpisodeMetadata {
  showTitle: string
  artworkUrl: string
  episodeGuid: string
  podcastItunesId: string
}

export interface CanonicalRemoteEpisodeMetadata extends CanonicalEpisodeMetadata {
  kind: typeof PLAYBACK_METADATA_KIND.REMOTE_EPISODE
  countryAtSave: SupportedCountry
}

interface CanonicalRemoteEpisodeMetadataInput extends SharedEpisodeMetadataInput {
  kind?: typeof PLAYBACK_METADATA_KIND.REMOTE_EPISODE
  showTitle: string
  artworkUrl: string
  episodeGuid: string
  podcastItunesId: string
  countryAtSave: SupportedCountry
}

export type EpisodeMetadata = LocalEpisodeMetadata | CanonicalRemoteEpisodeMetadata

export type EpisodeMetadataInput =
  | EpisodeMetadata
  | LocalEpisodeMetadataInput
  | CanonicalRemoteEpisodeMetadataInput

export interface CanonicalEpisodeIdentity {
  podcastItunesId: string
  episodeGuid: string
  countryAtSave: SupportedCountry
}

export interface CanonicalRemotePlaybackSource {
  audioUrl: string
  metadata: CanonicalRemoteEpisodeMetadata
}

export interface ResolvedPlaybackStateIdentity {
  key: string
  localTrackId: string | null
  audioUrl: string | null
  originalAudioUrl: string | null
  normalizedAudioUrl: string | null
  canonicalEpisode: CanonicalEpisodeIdentity | null
}

export function normalizeCountryAtSave(
  countryAtSave: string | null | undefined
): SupportedCountry | undefined {
  return normalizeCountryParam(countryAtSave) ?? undefined
}

export function normalizePlaybackAudioUrl(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('blob:')) return undefined
  return trimmed
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function hasNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasRemoteMetadataMarkers(metadata: EpisodeMetadataInput | null | undefined): boolean {
  return (
    metadata?.kind === PLAYBACK_METADATA_KIND.REMOTE_EPISODE ||
    hasNonEmptyString(metadata?.countryAtSave) ||
    hasNonEmptyString(metadata?.episodeGuid) ||
    hasNonEmptyString(metadata?.podcastItunesId)
  )
}

export function createCanonicalEpisodeMetadata(input: {
  description?: string
  showTitle: string
  artworkUrl: string
  publishedAt?: number
  durationSeconds?: number
  episodeGuid: string
  podcastItunesId: string
  transcriptUrl?: string
  originalAudioUrl?: string
  playbackRequestMode?: PlaybackRequestMode
}): CanonicalEpisodeMetadata {
  return {
    description: normalizeOptionalText(input.description),
    showTitle: input.showTitle.trim(),
    artworkUrl: input.artworkUrl.trim(),
    publishedAt: input.publishedAt,
    durationSeconds: input.durationSeconds,
    episodeGuid: input.episodeGuid.trim(),
    podcastItunesId: input.podcastItunesId.trim(),
    transcriptUrl: normalizeOptionalText(input.transcriptUrl),
    originalAudioUrl: normalizeOptionalText(input.originalAudioUrl),
    playbackRequestMode: input.playbackRequestMode,
  }
}

export function createLocalEpisodeMetadata(
  input: Omit<LocalEpisodeMetadata, 'kind'> = {}
): LocalEpisodeMetadata {
  return {
    kind: PLAYBACK_METADATA_KIND.LOCAL,
    description: normalizeOptionalText(input.description),
    showTitle: normalizeOptionalText(input.showTitle),
    transcriptUrl: normalizeOptionalText(input.transcriptUrl),
    artworkUrl: normalizeOptionalText(input.artworkUrl),
    publishedAt: input.publishedAt,
    durationSeconds: input.durationSeconds,
    originalAudioUrl: normalizeOptionalText(input.originalAudioUrl),
    playbackRequestMode: input.playbackRequestMode,
  }
}

export function withPlaybackRequestMode(
  metadata: EpisodeMetadataInput | null | undefined,
  playbackRequestMode: PlaybackRequestMode
): EpisodeMetadata | null {
  const normalizedMetadata = normalizeEpisodeMetadata(metadata)
  if (!normalizedMetadata) {
    return null
  }

  return {
    ...normalizedMetadata,
    playbackRequestMode,
  }
}

export function createCanonicalRemoteEpisodeMetadata(input: {
  description?: string
  showTitle: string
  artworkUrl: string
  publishedAt?: number
  durationSeconds?: number
  episodeGuid: string
  podcastItunesId: string
  transcriptUrl?: string
  originalAudioUrl?: string
  playbackRequestMode?: PlaybackRequestMode
  countryAtSave: SupportedCountry
}): CanonicalRemoteEpisodeMetadata | null {
  const showTitle = normalizeOptionalText(input.showTitle)
  const artworkUrl = normalizeOptionalText(input.artworkUrl)
  const episodeGuid = normalizeOptionalText(input.episodeGuid)
  const podcastItunesId = normalizeOptionalText(input.podcastItunesId)
  if (!showTitle || !artworkUrl || !episodeGuid || !podcastItunesId) {
    return null
  }

  return {
    kind: PLAYBACK_METADATA_KIND.REMOTE_EPISODE,
    description: normalizeOptionalText(input.description),
    showTitle,
    artworkUrl,
    publishedAt: input.publishedAt,
    durationSeconds: input.durationSeconds,
    episodeGuid,
    podcastItunesId,
    transcriptUrl: normalizeOptionalText(input.transcriptUrl),
    originalAudioUrl: normalizeOptionalText(input.originalAudioUrl),
    playbackRequestMode: input.playbackRequestMode,
    countryAtSave: input.countryAtSave,
  }
}

export function isCanonicalEpisodeMetadata(
  metadata: EpisodeMetadataInput | null | undefined
): boolean {
  return (
    hasNonEmptyString(metadata?.showTitle) &&
    hasNonEmptyString(metadata?.artworkUrl) &&
    hasNonEmptyString(metadata?.episodeGuid) &&
    hasNonEmptyString(metadata?.podcastItunesId)
  )
}

export function resolveCanonicalEpisodeIdentity(
  metadata: EpisodeMetadataInput | null | undefined
): CanonicalEpisodeIdentity | null {
  if (!metadata || !isCanonicalEpisodeMetadata(metadata)) {
    return null
  }

  const episodeGuid = normalizeOptionalText(metadata.episodeGuid)
  const podcastItunesId = normalizeOptionalText(metadata.podcastItunesId)
  const countryAtSave = normalizeCountryParam(metadata.countryAtSave)
  if (!episodeGuid || !podcastItunesId || !countryAtSave) {
    return null
  }

  return {
    podcastItunesId,
    episodeGuid,
    countryAtSave,
  }
}

export function isCanonicalRemoteEpisodeMetadata(
  metadata: EpisodeMetadataInput | null | undefined
): metadata is CanonicalRemoteEpisodeMetadata {
  return !!resolveCanonicalEpisodeIdentity(metadata)
}

export function normalizeEpisodeMetadata(
  metadata: EpisodeMetadataInput | null | undefined
): EpisodeMetadata | null {
  if (!metadata) return null

  const canonicalIdentity = resolveCanonicalEpisodeIdentity(metadata)
  if (canonicalIdentity) {
    const showTitle = normalizeOptionalText(metadata.showTitle)
    const artworkUrl = normalizeOptionalText(metadata.artworkUrl)
    if (!showTitle || !artworkUrl) {
      return null
    }

    return createCanonicalRemoteEpisodeMetadata({
      description: metadata.description,
      showTitle,
      artworkUrl,
      publishedAt: metadata.publishedAt,
      durationSeconds: metadata.durationSeconds,
      episodeGuid: canonicalIdentity.episodeGuid,
      podcastItunesId: canonicalIdentity.podcastItunesId,
      transcriptUrl: metadata.transcriptUrl,
      originalAudioUrl: metadata.originalAudioUrl,
      playbackRequestMode: metadata.playbackRequestMode,
      countryAtSave: canonicalIdentity.countryAtSave,
    })
  }

  if (hasRemoteMetadataMarkers(metadata)) {
    return null
  }

  return createLocalEpisodeMetadata({
    description: metadata.description,
    showTitle: normalizeOptionalText(metadata.showTitle),
    transcriptUrl: metadata.transcriptUrl,
    artworkUrl: normalizeOptionalText(metadata.artworkUrl),
    publishedAt: metadata.publishedAt,
    durationSeconds: metadata.durationSeconds,
    originalAudioUrl: normalizeOptionalText(metadata.originalAudioUrl),
    playbackRequestMode: metadata.playbackRequestMode,
  })
}

export function isLocalEpisodeMetadata(
  metadata: EpisodeMetadataInput | null | undefined
): metadata is LocalEpisodeMetadata {
  return normalizeEpisodeMetadata(metadata)?.kind === PLAYBACK_METADATA_KIND.LOCAL
}
