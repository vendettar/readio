import { createId } from '../id'
import { normalizeCountryParam } from '../routes/podcastRoutes'
import { buildFavoriteKey } from './favoriteIdentity'
import type { Favorite, PlaybackSession, PlaybackSessionCreateInput, Subscription } from './types'

function generateId(): string {
  return createId()
}

export function normalizeRequiredCountryAtSave(
  countryAtSave: string | null | undefined,
  entityName: string
): string {
  const normalized = normalizeCountryParam(countryAtSave)
  if (!normalized) {
    throw new Error(`[DB] ${entityName} requires a valid countryAtSave`)
  }
  return normalized
}

export function normalizeRequiredText(value: string | null | undefined, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[DB] ${fieldName} is required`)
  }
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`[DB] ${fieldName} is required`)
  }
  return normalized
}

export function normalizeRequiredUnixSeconds(
  value: number | null | undefined,
  fieldName: string
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`[DB] ${fieldName} requires Unix epoch seconds`)
  }
  return value
}

export function buildSubscriptionRecord(data: Omit<Subscription, 'id'>): Subscription {
  return normalizeSubscriptionRecord(
    {
      id: generateId(),
      ...data,
    },
    'subscription'
  )
}

export function normalizeSubscriptionRecord(
  record: Subscription,
  entityName: string
): Subscription {
  return {
    ...record,
    podcastItunesId: normalizeRequiredText(record.podcastItunesId, `${entityName} podcastItunesId`),
    title: normalizeRequiredText(record.title, `${entityName} title`),
    author: normalizeRequiredText(record.author, `${entityName} author`),
    artworkUrl: normalizeRequiredText(record.artworkUrl, `${entityName} artworkUrl`),
    countryAtSave: normalizeRequiredCountryAtSave(record.countryAtSave, entityName),
  }
}

export function normalizeFavoriteRecord(record: Favorite, entityName: string): Favorite {
  const key = buildFavoriteKey(record.podcastItunesId, record.episodeGuid)
  if (!key) {
    throw new Error(`[DB] ${entityName} requires canonical podcastItunesId + episodeGuid identity`)
  }

  const normalizedDescription =
    typeof record.description === 'string' ? record.description.trim() : ''
  const normalizedEpisodeArtworkUrl =
    typeof record.episodeArtworkUrl === 'string' ? record.episodeArtworkUrl.trim() : ''

  return {
    ...record,
    key,
    audioUrl: normalizeRequiredText(record.audioUrl, `${entityName} audioUrl`),
    episodeTitle: normalizeRequiredText(record.episodeTitle, `${entityName} episodeTitle`),
    podcastTitle: normalizeRequiredText(record.podcastTitle, `${entityName} podcastTitle`),
    artworkUrl: normalizeRequiredText(record.artworkUrl, `${entityName} artworkUrl`),
    episodeGuid: normalizeRequiredText(record.episodeGuid, `${entityName} episodeGuid`),
    podcastItunesId: normalizeRequiredText(record.podcastItunesId, `${entityName} podcastItunesId`),
    countryAtSave: normalizeRequiredCountryAtSave(record.countryAtSave, entityName),
    description: normalizedDescription,
    pubDate: normalizeRequiredUnixSeconds(record.pubDate, `${entityName} pubDate`),
    durationSeconds: record.durationSeconds ?? 0,
    episodeArtworkUrl: normalizedEpisodeArtworkUrl,
  }
}

export function buildPlaybackSessionRecord(data: PlaybackSessionCreateInput): PlaybackSession {
  const normalizedShowTitle =
    typeof data.showTitle === 'string' && data.showTitle.trim() ? data.showTitle.trim() : undefined
  const base = {
    id: data.id ?? generateId(),
    title: data.title ?? 'Untitled',
    createdAt: data.createdAt ?? Date.now(),
    lastPlayedAt: data.lastPlayedAt ?? Date.now(),
    sizeBytes: data.sizeBytes ?? 0,
    durationSeconds: data.durationSeconds ?? 0,
    audioId: data.audioId ?? null,
    subtitleId: data.subtitleId ?? null,
    hasAudioBlob: data.hasAudioBlob ?? false,
    progress: data.progress ?? 0,
    audioFilename: data.audioFilename ?? '',
    subtitleFilename: data.subtitleFilename ?? '',
    audioUrl: data.audioUrl,
    localTrackId: data.localTrackId,
    artworkUrl: data.artworkUrl,
    description: data.description,
    showTitle: normalizedShowTitle,
    publishedAt: data.publishedAt,
    episodeGuid: data.episodeGuid,
    podcastItunesId: data.podcastItunesId,
    transcriptUrl: data.transcriptUrl,
  }

  if (data.source === 'explore') {
    return {
      ...base,
      source: 'explore',
      audioUrl: normalizeRequiredText(data.audioUrl, 'playback session audioUrl'),
      artworkUrl: normalizeRequiredText(data.artworkUrl, 'playback session artworkUrl'),
      showTitle: normalizeRequiredText(data.showTitle, 'playback session showTitle'),
      episodeGuid: normalizeRequiredText(data.episodeGuid, 'playback session episodeGuid'),
      podcastItunesId: normalizeRequiredText(
        data.podcastItunesId,
        'playback session podcastItunesId'
      ),
      countryAtSave: normalizeRequiredCountryAtSave(data.countryAtSave, 'playback session'),
    }
  }

  return {
    ...base,
    source: 'local',
    showTitle: normalizedShowTitle,
    episodeGuid: undefined,
    podcastItunesId: undefined,
    countryAtSave: undefined,
  }
}

export function normalizePlaybackSessionRecord(
  record: PlaybackSession,
  entityName: string
): PlaybackSession {
  const normalizedShowTitle =
    typeof record.showTitle === 'string' && record.showTitle.trim()
      ? record.showTitle.trim()
      : undefined
  if (record.source === 'explore') {
    return {
      ...record,
      source: 'explore',
      audioUrl: normalizeRequiredText(record.audioUrl, `${entityName} audioUrl`),
      artworkUrl: normalizeRequiredText(record.artworkUrl, `${entityName} artworkUrl`),
      showTitle: normalizeRequiredText(record.showTitle, `${entityName} showTitle`),
      episodeGuid: normalizeRequiredText(record.episodeGuid, `${entityName} episodeGuid`),
      podcastItunesId: normalizeRequiredText(
        record.podcastItunesId,
        `${entityName} podcastItunesId`
      ),
      countryAtSave: normalizeRequiredCountryAtSave(record.countryAtSave, entityName),
    }
  }

  return {
    ...record,
    source: 'local',
    showTitle: normalizedShowTitle,
    episodeGuid: undefined,
    podcastItunesId: undefined,
    countryAtSave: undefined,
  }
}
