import { normalizePodcastAudioUrl } from '../../networking/urlUtils'
import {
  type CanonicalEpisodeIdentity,
  type CanonicalRemotePlaybackSource,
  type EpisodeMetadataInput,
  isCanonicalRemoteEpisodeMetadata,
  normalizePlaybackAudioUrl,
  type ResolvedPlaybackStateIdentity,
  resolveCanonicalEpisodeIdentity,
} from './playbackMetadataModel'

type PlaybackSourceMetadata = {
  originalAudioUrl?: string
}

export const resolveCanonicalPlaybackIdentity = resolveCanonicalEpisodeIdentity

export function buildCanonicalPlaybackIdentityKey(identity: CanonicalEpisodeIdentity): string {
  return `podcast:${identity.podcastItunesId}:episode:${identity.episodeGuid}:country:${identity.countryAtSave}`
}

function normalizePlaybackIdentityUrl(value: string | null | undefined): string | null {
  const normalized = normalizePlaybackAudioUrl(value)
  if (!normalized) return null
  return normalizePodcastAudioUrl(normalized) || normalized
}

function resolvePlaybackUrlIdentity(input: {
  audioUrl?: string | null
  metadata?: PlaybackSourceMetadata | null
}): {
  audioUrl: string | null
  originalAudioUrl: string | null
  normalizedAudioUrl: string | null
} {
  const audioUrl = normalizePlaybackIdentityUrl(input.audioUrl)
  const originalAudioUrl = normalizePlaybackIdentityUrl(input.metadata?.originalAudioUrl)

  return {
    audioUrl,
    originalAudioUrl,
    normalizedAudioUrl: originalAudioUrl ?? audioUrl,
  }
}

export function buildPlaybackIdentityKey(input: {
  localTrackId: string | null
  normalizedAudioUrl: string | null
  audioUrl?: string | null
  originalAudioUrl?: string | null
  canonicalEpisode?: CanonicalEpisodeIdentity | null
}): string {
  if (input.canonicalEpisode) {
    return buildCanonicalPlaybackIdentityKey({
      podcastItunesId: input.canonicalEpisode.podcastItunesId.trim(),
      episodeGuid: input.canonicalEpisode.episodeGuid.trim(),
      countryAtSave: input.canonicalEpisode.countryAtSave,
    })
  }

  if (input.localTrackId) {
    return `local-track:${input.localTrackId}`
  }

  const normalizedAudioUrl =
    normalizePlaybackIdentityUrl(input.normalizedAudioUrl) ??
    normalizePlaybackIdentityUrl(input.originalAudioUrl) ??
    normalizePlaybackIdentityUrl(input.audioUrl) ??
    ''
  return `remote-playback:${normalizedAudioUrl}`
}

export function resolvePlaybackStateIdentity(input: {
  localTrackId?: string | null
  audioUrl?: string | null
  metadata?: EpisodeMetadataInput | null
}): ResolvedPlaybackStateIdentity | null {
  const localTrackId = input.localTrackId ?? null
  const metadata = input.metadata
  const canonicalEpisode = resolveCanonicalPlaybackIdentity(metadata)
  const urlIdentity = resolvePlaybackUrlIdentity({
    audioUrl: input.audioUrl,
    metadata,
  })

  if (!canonicalEpisode && !localTrackId && !urlIdentity.normalizedAudioUrl) {
    return null
  }

  return {
    key: buildPlaybackIdentityKey({
      localTrackId,
      normalizedAudioUrl: urlIdentity.normalizedAudioUrl,
      audioUrl: urlIdentity.audioUrl,
      originalAudioUrl: urlIdentity.originalAudioUrl,
      canonicalEpisode,
    }),
    localTrackId,
    audioUrl: urlIdentity.audioUrl,
    originalAudioUrl: urlIdentity.originalAudioUrl,
    normalizedAudioUrl: urlIdentity.normalizedAudioUrl,
    canonicalEpisode,
  }
}

export function resolvePlaybackSourceAudioUrl(
  audioUrl: string | null | undefined,
  metadata?: PlaybackSourceMetadata | null
): string {
  if (typeof metadata?.originalAudioUrl === 'string' && metadata.originalAudioUrl.trim()) {
    return metadata.originalAudioUrl.trim()
  }
  if (typeof audioUrl === 'string' && audioUrl.trim()) {
    return audioUrl.trim()
  }
  return ''
}

export function resolveCanonicalRemotePlaybackSource(input: {
  audioUrl: string | null | undefined
  metadata?: EpisodeMetadataInput | null
}): CanonicalRemotePlaybackSource | null {
  if (!isCanonicalRemoteEpisodeMetadata(input.metadata)) {
    return null
  }

  const sourceAudioUrl = resolvePlaybackSourceAudioUrl(input.audioUrl, input.metadata)
  if (!sourceAudioUrl) {
    return null
  }

  return {
    audioUrl: sourceAudioUrl,
    metadata: input.metadata,
  }
}

export function resolvePlaybackContentIdentityKey(input: {
  audioUrl?: string | null
  metadata?: EpisodeMetadataInput | null
}): string | null {
  const canonicalIdentity = resolveCanonicalEpisodeIdentity(input.metadata)
  if (canonicalIdentity) {
    return buildCanonicalPlaybackIdentityKey(canonicalIdentity)
  }

  const normalizedAudioUrl = normalizePlaybackAudioUrl(
    resolvePlaybackSourceAudioUrl(input.audioUrl, input.metadata)
  )
  if (!normalizedAudioUrl) {
    return null
  }

  return `remote-playback:${normalizedAudioUrl}`
}
