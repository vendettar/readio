// src/lib/dexieDb.ts
// IndexedDB via Dexie for session persistence and  file storage
import Dexie, { type EntityTable, type Table } from 'dexie'
import { createId } from './id'
import { log, error as logError, warn } from './logger'
import { normalizeCountryParam } from './routes/podcastRoutes'
import { getAppConfig } from './runtimeConfig'

// Use new database name - fresh start per first-release policy
const getDbName = () => getAppConfig().DB_NAME

import type {
  AudioBlob,
  CredentialEntry,
  ExplorePlaybackSession,
  Favorite,
  FileFolder,
  FileSubtitle,
  FileTrack,
  LocalPlaybackSession,
  PlaybackSession,
  PlaybackSessionCreateInput,
  PlaybackSessionUpdatePatch,
  PodcastDownload,
  PodcastDownloadCreateInput,
  RemoteTranscriptCache,
  RuntimeCacheEntry,
  Setting,
  Subscription,
  SubtitleSourceKind,
  SubtitleText,
  SubtitleVersionStatus,
  Track,
} from './db/types'
// Import entity types from the canonical type definition file
import {
  fromStoredFolderId,
  isNavigableExplorePlaybackSession,
  isPodcastDownloadTrack,
  isUserUploadTrack,
  TRACK_SOURCE,
  toStoredFolderId,
} from './db/types'

// Re-export domain entity types for app-layer imports.
export type {
  AudioBlob,
  CredentialEntry,
  Favorite,
  FileFolder,
  FileSubtitle,
  Track,
  FileTrack,
  ExplorePlaybackSession,
  LocalPlaybackSession,
  PodcastDownload,
  PodcastDownloadCreateInput,
  PlaybackSession,
  PlaybackSessionCreateInput,
  PlaybackSessionUpdatePatch,
  RemoteTranscriptCache,
  RuntimeCacheEntry,
  Setting,
  Subscription,
  SubtitleSourceKind,
  SubtitleText,
  SubtitleVersionStatus,
}
export { isNavigableExplorePlaybackSession }

// Dexie database table names SSOT
export const DB_TABLE_NAMES = {
  PLAYBACK_SESSIONS: 'playback_sessions',
  AUDIO_BLOBS: 'audioBlobs',
  SUBTITLES: 'subtitles',
  REMOTE_TRANSCRIPTS: 'remote_transcripts',
  SUBSCRIPTIONS: 'subscriptions',
  FAVORITES: 'favorites',
  SETTINGS: 'settings',
  CREDENTIALS: 'credentials',
  RUNTIME_CACHE: 'runtime_cache',
  FOLDERS: 'folders',
  TRACKS: 'tracks',
  LOCAL_SUBTITLES: 'local_subtitles',
} as const

const TRACKS_SCHEMA =
  'id, name, folderId, createdAt, audioId, artworkId, sourceType, sourceUrlNormalized, sourceEpisodeGuid, &[sourceType+sourceUrlNormalized], [sourceType+createdAt], [sourceType+folderId], [sourceType+folderId+createdAt]'

function buildSchema(tracksSchema: string) {
  return {
    [DB_TABLE_NAMES.TRACKS]: tracksSchema,
    [DB_TABLE_NAMES.PLAYBACK_SESSIONS]:
      'id, title, lastPlayedAt, audioUrl, localTrackId, audioId, episodeGuid, [audioUrl+lastPlayedAt], [localTrackId+lastPlayedAt]',
    [DB_TABLE_NAMES.AUDIO_BLOBS]: 'id, storedAt',
    [DB_TABLE_NAMES.SUBTITLES]: 'id, storedAt, asrFingerprint',
    [DB_TABLE_NAMES.REMOTE_TRANSCRIPTS]: 'id, &url, fetchedAt, asrFingerprint',
    [DB_TABLE_NAMES.SUBSCRIPTIONS]: 'id, &feedUrl, addedAt, podcastItunesId',
    [DB_TABLE_NAMES.FAVORITES]: 'id, &key, addedAt, episodeGuid, audioUrl',
    [DB_TABLE_NAMES.SETTINGS]: 'key',
    [DB_TABLE_NAMES.CREDENTIALS]: 'key',
    [DB_TABLE_NAMES.RUNTIME_CACHE]: '&key, namespace',
    [DB_TABLE_NAMES.FOLDERS]: 'id, name, createdAt',
    [DB_TABLE_NAMES.LOCAL_SUBTITLES]: 'id, trackId, subtitleId',
  }
}

// Dexie database class
class ReadioDB extends Dexie {
  playback_sessions!: EntityTable<PlaybackSession, 'id'>
  audioBlobs!: EntityTable<AudioBlob, 'id'>
  subtitles!: EntityTable<SubtitleText, 'id'>
  remote_transcripts!: EntityTable<RemoteTranscriptCache, 'id'>

  // Subscriptions/favorites
  subscriptions!: EntityTable<Subscription, 'id'>
  favorites!: EntityTable<Favorite, 'id'>
  settings!: EntityTable<Setting, 'key'>
  credentials!: EntityTable<CredentialEntry, 'key'>
  runtime_cache!: EntityTable<RuntimeCacheEntry, 'key'>

  // files
  folders!: EntityTable<FileFolder, 'id'>
  tracks!: EntityTable<Track, 'id'>
  local_subtitles!: EntityTable<FileSubtitle, 'id'>

  constructor() {
    super(getDbName())

    this.version(9).stores(buildSchema(TRACKS_SCHEMA))
  }
}

export const db = new ReadioDB()

export type DbTableName = (typeof DB_TABLE_NAMES)[keyof typeof DB_TABLE_NAMES]

/**
 * Derived type representing any valid table object from ReadioDB.
 * Eliminates "any" by constraining to actual database properties that are Tables.
 */
export type ReadioTable = {
  [K in keyof ReadioDB]: ReadioDB[K] extends Table<infer T, infer TKey> ? Table<T, TKey> : never
}[keyof ReadioDB]

const DB_TABLE_OBJECTS: Record<DbTableName, ReadioTable> = {
  playback_sessions: db.playback_sessions,
  audioBlobs: db.audioBlobs,
  subtitles: db.subtitles,
  remote_transcripts: db.remote_transcripts,
  subscriptions: db.subscriptions,
  favorites: db.favorites,
  settings: db.settings,
  credentials: db.credentials,
  runtime_cache: db.runtime_cache,
  folders: db.folders,
  tracks: db.tracks,
  local_subtitles: db.local_subtitles,
}

// Use the centralized ID generator
function generateId(): string {
  return createId()
}

function normalizeRequiredCountryAtSave(
  countryAtSave: string | null | undefined,
  entityName: string
): string {
  const normalized = normalizeCountryParam(countryAtSave)
  if (!normalized) {
    throw new Error(`[DB] ${entityName} requires a valid countryAtSave`)
  }
  return normalized
}

function buildPlaybackSessionRecord(data: PlaybackSessionCreateInput): PlaybackSession {
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
    podcastTitle: data.podcastTitle,
    podcastFeedUrl: data.podcastFeedUrl,
    publishedAt: data.publishedAt,
    episodeGuid: data.episodeGuid,
    podcastItunesId: data.podcastItunesId,
    transcriptUrl: data.transcriptUrl,
  }

  if (data.source === 'explore') {
    return {
      ...base,
      source: 'explore',
      countryAtSave: normalizeRequiredCountryAtSave(data.countryAtSave, 'playback session'),
    }
  }

  return {
    ...base,
    source: 'local',
  }
}

function normalizePlaybackSessionRecord(
  record: PlaybackSession,
  entityName: string
): PlaybackSession {
  if (record.source === 'explore') {
    return {
      ...record,
      source: 'explore',
      countryAtSave: normalizeRequiredCountryAtSave(record.countryAtSave, entityName),
    }
  }

  return {
    ...record,
    source: 'local',
    countryAtSave: undefined,
  }
}

function compareFileSubtitlesForDisplay(a: FileSubtitle, b: FileSubtitle): number {
  const createdAtDelta = a.createdAt - b.createdAt
  if (createdAtDelta !== 0) return createdAtDelta

  const nameDelta = a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  if (nameDelta !== 0) return nameDelta

  return a.id.localeCompare(b.id)
}

function toPublicFileTrack(track: FileTrack): FileTrack {
  return {
    ...track,
    folderId: fromStoredFolderId(track.folderId),
  }
}

async function clearLocalPlaybackSessionAudioRefs(
  trackId: string,
  audioId?: string
): Promise<void> {
  await db.playback_sessions
    .where('localTrackId')
    .equals(trackId)
    .modify((session) => {
      session.localTrackId = null
      if (audioId && session.audioId === audioId) {
        session.audioId = null
        session.hasAudioBlob = false
      }
    })

  if (!audioId) return

  await db.playback_sessions
    .where('audioId')
    .equals(audioId)
    .and((session) => session.source === 'local' && !session.localTrackId)
    .modify((session) => {
      session.audioId = null
      session.hasAudioBlob = false
    })
}

async function getAudioBlobReferenceCounts(
  audioId: string,
  options: { excludeTrackId?: string } = {}
): Promise<{
  referencedBySession: number
  referencedByTrackAudio: number
  referencedByTrackArtwork: number
}> {
  const { excludeTrackId } = options
  const referencedBySession = await db.playback_sessions.where('audioId').equals(audioId).count()
  const referencedByTrackAudio = excludeTrackId
    ? await db.tracks
        .where('audioId')
        .equals(audioId)
        .filter((track) => track.id !== excludeTrackId)
        .count()
    : await db.tracks.where('audioId').equals(audioId).count()
  const referencedByTrackArtwork = excludeTrackId
    ? await db.tracks
        .where('artworkId')
        .equals(audioId)
        .and((track) => track.id !== excludeTrackId)
        .count()
    : await db.tracks.where('artworkId').equals(audioId).count()
  return {
    referencedBySession,
    referencedByTrackAudio,
    referencedByTrackArtwork,
  }
}

async function deleteAudioBlobIfUnreferenced(
  audioId: string,
  excludeTrackId: string
): Promise<void> {
  const refs = await getAudioBlobReferenceCounts(audioId, { excludeTrackId })
  if (
    refs.referencedBySession === 0 &&
    refs.referencedByTrackAudio === 0 &&
    refs.referencedByTrackArtwork === 0
  ) {
    await db.audioBlobs.delete(audioId)
  }
}

async function deleteArtworkBlobIfUnreferenced(
  artworkId: string,
  excludeTrackId: string
): Promise<void> {
  const refs = await getAudioBlobReferenceCounts(artworkId, { excludeTrackId })
  if (
    refs.referencedBySession === 0 &&
    refs.referencedByTrackAudio === 0 &&
    refs.referencedByTrackArtwork === 0
  ) {
    await db.audioBlobs.delete(artworkId)
  }
}

async function deleteFileSubtitleWithBlobProtection(id: string): Promise<FileSubtitle | undefined> {
  const sub = await db.local_subtitles.get(id)
  if (!sub) return undefined

  if (sub.subtitleId) {
    const refCount = await db.local_subtitles.where('subtitleId').equals(sub.subtitleId).count()
    if (refCount <= 1) {
      await db.subtitles.delete(sub.subtitleId)
    }
  }
  await db.local_subtitles.delete(id)
  return sub
}

export const DB = {
  // ========== Playback Session CRUD ==========
  async createPlaybackSession(data: PlaybackSessionCreateInput): Promise<string> {
    const item = buildPlaybackSessionRecord(data)
    await db.playback_sessions.put(item)
    return item.id
  },

  async upsertPlaybackSession(data: PlaybackSessionCreateInput): Promise<string> {
    const id = data.id || generateId()
    const existing = await db.playback_sessions.get(id)

    if (existing) {
      const merged = {
        ...existing,
        ...data,
        id, // Ensure ID is correct
        // Preserve these if not explicitly provided in data
        progress: data.progress !== undefined ? data.progress : existing.progress,
        durationSeconds:
          data.durationSeconds !== undefined ? data.durationSeconds : existing.durationSeconds,
        lastPlayedAt: data.lastPlayedAt !== undefined ? data.lastPlayedAt : existing.lastPlayedAt,
      }
      const updated = normalizePlaybackSessionRecord(merged as PlaybackSession, 'playback session')
      await db.playback_sessions.put(updated)
      return id
    }

    // Default to create behavior if not found
    return this.createPlaybackSession({ ...data, id })
  },

  async updatePlaybackSession(id: string, updates: PlaybackSessionUpdatePatch): Promise<void> {
    const existing = await db.playback_sessions.get(id)
    if (!existing) {
      throw new Error(`Playback session ${id} not found`)
    }
    const merged = {
      ...existing,
      ...updates,
      // Only update timestamp if explicitly provided, otherwise keep existing
      lastPlayedAt: updates.lastPlayedAt ?? existing.lastPlayedAt,
    }
    const updated = normalizePlaybackSessionRecord(merged as PlaybackSession, 'playback session')
    await db.playback_sessions.put(updated)
  },

  async getPlaybackSession(id: string): Promise<PlaybackSession | undefined> {
    return db.playback_sessions.get(id)
  },

  async getLastPlaybackSession(): Promise<PlaybackSession | undefined> {
    return db.playback_sessions.orderBy('lastPlayedAt').reverse().first()
  },

  async getAllPlaybackSessions(): Promise<PlaybackSession[]> {
    return db.playback_sessions.orderBy('lastPlayedAt').reverse().toArray()
  },

  async getPlaybackSessionsByEpisodeGuid(episodeGuid: string): Promise<PlaybackSession[]> {
    if (!episodeGuid) return []
    return db.playback_sessions.where('episodeGuid').equals(episodeGuid).toArray()
  },

  async getPlaybackSessionsByAudioUrl(audioUrl: string): Promise<PlaybackSession[]> {
    if (!audioUrl) return []
    return db.playback_sessions.where('audioUrl').equals(audioUrl).toArray()
  },

  async findLastSessionByUrl(audioUrl: string): Promise<PlaybackSession | undefined> {
    if (!audioUrl) return undefined
    return db.playback_sessions
      .where('[audioUrl+lastPlayedAt]')
      .between([audioUrl, Dexie.minKey], [audioUrl, Dexie.maxKey])
      .last()
  },

  async findLastSessionByTrackId(trackId: string): Promise<PlaybackSession | undefined> {
    if (!trackId) return undefined
    return db.playback_sessions
      .where('[localTrackId+lastPlayedAt]')
      .between([trackId, Dexie.minKey], [trackId, Dexie.maxKey])
      .last()
  },

  async getPlaybackSessionCutoff(limit: number): Promise<number> {
    const item = await db.playback_sessions
      .orderBy('lastPlayedAt')
      .reverse()
      .offset(limit - 1)
      .first()
    return item?.lastPlayedAt ?? 0
  },

  async getOldPlaybackSessionIds(cutoff: number): Promise<string[]> {
    const ids = await db.playback_sessions.where('lastPlayedAt').below(cutoff).primaryKeys()
    return ids as string[]
  },

  async deletePlaybackSessionsBulk(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    await db.playback_sessions.bulkDelete(ids)
    return ids.length
  },

  async deletePlaybackSession(id: string): Promise<void> {
    // Note: We deliberately do NOT delete associated audio/subtitle blobs here.
    // Audio blobs are source files (possibly shared or managed by File Library).
    // Sessions are just playback records.
    await db.playback_sessions.delete(id)
  },

  async clearPlaybackSessionAudioCache(id: string): Promise<boolean> {
    return db.transaction('rw', [db.playback_sessions, db.audioBlobs, db.tracks], async () => {
      const session = await db.playback_sessions.get(id)
      if (!session?.audioId) return false

      const audioId = session.audioId
      await db.playback_sessions.update(id, {
        audioId: null,
        hasAudioBlob: false,
      })

      const refs = await getAudioBlobReferenceCounts(audioId)
      if (
        refs.referencedBySession === 0 &&
        refs.referencedByTrackAudio === 0 &&
        refs.referencedByTrackArtwork === 0
      ) {
        await db.audioBlobs.delete(audioId)
      }

      return true
    })
  },

  async getAllFolderIds(): Promise<string[]> {
    const ids = await db.folders.toCollection().primaryKeys()
    return ids as string[]
  },

  // ========== audioBlob CRUD ==========
  async getAllAudioBlobIds(): Promise<string[]> {
    const ids = await db.audioBlobs.toCollection().primaryKeys()
    return ids as string[]
  },

  async addAudioBlob(blob: Blob, filename: string): Promise<string> {
    const id = generateId()
    const audioBlob: AudioBlob = {
      id,
      blob,
      size: blob.size,
      type: blob.type,
      filename,
      storedAt: Date.now(),
    }
    await db.audioBlobs.put(audioBlob)
    return id
  },

  async getAudioBlob(id: string): Promise<AudioBlob | undefined> {
    return db.audioBlobs.get(id)
  },

  async getAllAudioBlobs(): Promise<AudioBlob[]> {
    return db.audioBlobs.orderBy('storedAt').reverse().toArray()
  },

  async deleteAudioBlob(id: string): Promise<void> {
    await db.transaction('rw', [db.audioBlobs, db.playback_sessions, db.tracks], async () => {
      const { referencedBySession, referencedByTrackAudio, referencedByTrackArtwork } =
        await getAudioBlobReferenceCounts(id)

      if (referencedBySession > 0 || referencedByTrackAudio > 0 || referencedByTrackArtwork > 0) {
        if (import.meta.env.DEV) {
          warn('[DB] deleteAudioBlob blocked by active references', {
            id,
            referencedBySession,
            referencedByTrackAudio,
            referencedByTrackArtwork,
          })
        }
        return
      }

      await db.audioBlobs.delete(id)
    })
  },

  async deleteAudioBlobsBulk(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    await db.audioBlobs.bulkDelete(ids)
    return ids.length
  },

  // Clear all audio blobs and keep metadata rows for recovery/diagnostics
  async clearAllAudioBlobs(): Promise<void> {
    const allBlobs = await db.audioBlobs.toArray()
    if (allBlobs.length === 0) return

    const deletedBlobIds = new Set<string>(allBlobs.map((blob) => blob.id))

    await db.transaction('rw', [db.audioBlobs, db.playback_sessions, db.tracks], async () => {
      await db.audioBlobs.clear()

      const sessions = await db.playback_sessions.toArray()
      for (const session of sessions) {
        const lostAudio = !!session.audioId && deletedBlobIds.has(session.audioId)
        if (!lostAudio && !session.hasAudioBlob) continue

        await db.playback_sessions.put({
          ...session,
          audioId: null,
          hasAudioBlob: false,
        })
      }

      await db.tracks.toCollection().modify((track) => {
        const lostAudio = deletedBlobIds.has(track.audioId)
        const lostArtwork = !!track.artworkId && deletedBlobIds.has(track.artworkId)
        if (lostAudio || lostArtwork) {
          track.isCorrupted = true
        }
      })
    })
  },

  // ========== subtitle CRUD ==========
  async addSubtitle(
    cues: import('./asr/types').ASRCue[],
    filename: string,
    asrFingerprint?: string
  ): Promise<string> {
    const id = generateId()
    const subtitle: SubtitleText = {
      id,
      cues,
      cueSchemaVersion: 1,
      asrFingerprint,
      size: new Blob([JSON.stringify(cues)]).size,
      filename,
      storedAt: Date.now(),
    }
    await db.subtitles.put(subtitle)
    return id
  },

  async findSubtitleByFingerprint(fingerprint: string): Promise<SubtitleText | undefined> {
    if (!fingerprint) return undefined
    return db.subtitles.where('asrFingerprint').equals(fingerprint).first()
  },

  async getSubtitle(id: string): Promise<SubtitleText | undefined> {
    return db.subtitles.get(id)
  },

  async getAllSubtitles(): Promise<SubtitleText[]> {
    return db.subtitles.orderBy('storedAt').reverse().toArray()
  },

  async deleteSubtitle(id: string): Promise<void> {
    await db.transaction('rw', [db.subtitles, db.local_subtitles], async () => {
      const refCount = await db.local_subtitles.where('subtitleId').equals(id).count()
      if (refCount > 0) {
        if (import.meta.env.DEV) {
          warn('[DB] deleteSubtitle blocked by active references', { id, refCount })
        }
        return
      }
      await db.subtitles.delete(id)
    })
  },

  // ========== Remote Transcript Cache CRUD ==========
  async upsertRemoteTranscript(
    data: Omit<RemoteTranscriptCache, 'id' | 'fetchedAt'> & {
      id: string
      fetchedAt?: number
    }
  ): Promise<string> {
    const record: RemoteTranscriptCache = {
      ...data,
      fetchedAt: data.fetchedAt ?? Date.now(),
      cueSchemaVersion: data.cueSchemaVersion ?? 1,
    }
    await db.remote_transcripts.put(record)
    return record.id
  },

  async getRemoteTranscriptById(id: string): Promise<RemoteTranscriptCache | undefined> {
    return db.remote_transcripts.get(id)
  },

  async getRemoteTranscriptByUrl(url: string): Promise<RemoteTranscriptCache | undefined> {
    return db.remote_transcripts.where('url').equals(url).first()
  },

  async findRemoteTranscriptByFingerprint(
    fingerprint: string
  ): Promise<RemoteTranscriptCache | undefined> {
    if (!fingerprint) return undefined
    return db.remote_transcripts.where('asrFingerprint').equals(fingerprint).first()
  },

  async getAllRemoteTranscripts(): Promise<RemoteTranscriptCache[]> {
    return db.remote_transcripts.orderBy('fetchedAt').reverse().toArray()
  },

  async deleteRemoteTranscriptById(id: string): Promise<void> {
    await db.remote_transcripts.delete(id)
  },

  async clearRemoteTranscripts(): Promise<void> {
    await db.remote_transcripts.clear()
  },

  async pruneRemoteTranscripts(maxEntries: number, maxAgeMs: number): Promise<void> {
    const now = Date.now()
    const deleteIdSet = new Set<string>()

    if (maxAgeMs > 0) {
      const staleIds = await db.remote_transcripts
        .where('fetchedAt')
        .below(now - maxAgeMs)
        .primaryKeys()
      for (const id of staleIds) {
        if (typeof id === 'string') {
          deleteIdSet.add(id)
        }
      }
    }

    if (maxEntries > 0) {
      const total = await db.remote_transcripts.count()
      const excess = total - maxEntries
      if (excess > 0) {
        const oldestIds = await db.remote_transcripts
          .orderBy('fetchedAt')
          .limit(excess)
          .primaryKeys()
        for (const id of oldestIds) {
          if (typeof id === 'string') {
            deleteIdSet.add(id)
          }
        }
      }
    }

    if (deleteIdSet.size > 0) {
      await db.remote_transcripts.bulkDelete([...deleteIdSet])
    }
  },

  // ========== Utility ==========
  async getStorageStats(): Promise<{
    sessions: number
    audioBlobs: number
    subtitles: number
    remoteTranscripts: number
    totalSize: number
  }> {
    const sessions = await this.getAllPlaybackSessions()
    const audioBlobs = await this.getAllAudioBlobs()
    const subtitles = await this.getAllSubtitles()
    const remoteTranscripts = await this.getAllRemoteTranscripts()

    const totalSize =
      audioBlobs.reduce((sum, a) => sum + a.size, 0) +
      subtitles.reduce((sum, s) => sum + s.size, 0) +
      remoteTranscripts.reduce((sum, item) => sum + new Blob([JSON.stringify(item.cues)]).size, 0)

    return {
      sessions: sessions.length,
      audioBlobs: audioBlobs.length,
      subtitles: subtitles.length,
      remoteTranscripts: remoteTranscripts.length,
      totalSize,
    }
  },

  async getStorageInfo(): Promise<{
    indexedDB: {
      sessions: number
      audioBlobs: number
      audioBlobsSize: number
      subtitles: number
      subtitlesSize: number
      remoteTranscripts: number
      remoteTranscriptsSize: number
      totalSize: number
    }
    browser: {
      usage: number
      quota: number
      available: number
      percentage: number
    } | null
  }> {
    const sessions = await this.getAllPlaybackSessions()
    const audioBlobs = await this.getAllAudioBlobs()
    const subtitles = await this.getAllSubtitles()
    const remoteTranscripts = await this.getAllRemoteTranscripts()

    const audioBlobsSize = audioBlobs.reduce((sum, a) => sum + a.size, 0)
    const subtitlesSize = subtitles.reduce((sum, s) => sum + s.size, 0)
    const remoteTranscriptsSize = remoteTranscripts.reduce(
      (sum, item) => sum + new Blob([JSON.stringify(item.cues)]).size,
      0
    )
    const totalSize = audioBlobsSize + subtitlesSize + remoteTranscriptsSize

    let browserInfo: {
      usage: number
      quota: number
      available: number
      percentage: number
    } | null = null

    if (navigator.storage?.estimate) {
      try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate()
        browserInfo = {
          usage,
          quota,
          available: quota - usage,
          percentage: quota > 0 ? (usage / quota) * 100 : 0,
        }
      } catch (err) {
        logError('[DB] Failed to get browser storage estimate:', err)
      }
    }

    return {
      indexedDB: {
        sessions: sessions.length,
        audioBlobs: audioBlobs.length,
        audioBlobsSize,
        subtitles: subtitles.length,
        subtitlesSize,
        remoteTranscripts: remoteTranscripts.length,
        remoteTranscriptsSize,
        totalSize,
      },
      browser: browserInfo,
    }
  },

  // ========== Subscriptions CRUD ==========
  async addSubscription(sub: Omit<Subscription, 'id'>): Promise<string> {
    const newSub: Subscription = {
      id: generateId(),
      ...sub,
    }
    await db.subscriptions.put(newSub)
    return newSub.id
  },

  async getSubscriptionByFeedUrl(feedUrl: string): Promise<Subscription | undefined> {
    return db.subscriptions.where('feedUrl').equals(feedUrl).first()
  },

  async getSubscriptionsByPodcastItunesId(podcastItunesId?: string): Promise<Subscription[]> {
    if (!podcastItunesId) return []
    return db.subscriptions.where('podcastItunesId').equals(podcastItunesId).toArray()
  },

  async removeSubscriptionByFeedUrl(feedUrl: string): Promise<void> {
    const sub = await this.getSubscriptionByFeedUrl(feedUrl)
    if (sub) {
      await db.subscriptions.delete(sub.id)
    }
  },

  async getAllSubscriptions(): Promise<Subscription[]> {
    return db.subscriptions.orderBy('addedAt').reverse().toArray()
  },

  // ========== Favorites CRUD ==========
  async addFavorite(fav: Omit<Favorite, 'id'>): Promise<string> {
    const newFav: Favorite = {
      id: generateId(),
      ...fav,
      countryAtSave: normalizeRequiredCountryAtSave(fav.countryAtSave, 'favorite'),
    }
    await db.favorites.put(newFav)
    return newFav.id
  },

  async getFavoriteByKey(key: string): Promise<Favorite | undefined> {
    return db.favorites.where('key').equals(key).first()
  },

  async getFavoritesByEpisodeGuid(episodeGuid: string): Promise<Favorite[]> {
    if (!episodeGuid) return []
    return db.favorites.where('episodeGuid').equals(episodeGuid).toArray()
  },

  async getFavoritesByAudioUrl(audioUrl: string): Promise<Favorite[]> {
    if (!audioUrl) return []
    return db.favorites.where('audioUrl').equals(audioUrl).toArray()
  },

  async removeFavoriteByKey(key: string): Promise<void> {
    const fav = await this.getFavoriteByKey(key)
    if (fav) {
      await db.favorites.delete(fav.id)
    }
  },

  async getAllFavorites(): Promise<Favorite[]> {
    return db.favorites.orderBy('addedAt').reverse().toArray()
  },

  // ========== Settings CRUD ==========
  async getSetting(key: string): Promise<string | null> {
    const result = await db.settings.get(key)
    return result?.value ?? null
  },

  async setSetting(key: string, value: string): Promise<void> {
    const setting: Setting = {
      key,
      value,
      updatedAt: Date.now(),
    }
    await db.settings.put(setting)
  },

  // ========== Runtime Cache CRUD ==========
  async getRuntimeCacheEntry<T = unknown>(
    key: string
  ): Promise<(RuntimeCacheEntry & { data: T }) | undefined> {
    const entry = await db.runtime_cache.get(key)
    if (!entry) return undefined
    return entry as RuntimeCacheEntry & { data: T }
  },

  async setRuntimeCacheEntry<T = unknown>(entry: {
    key: string
    namespace: string
    data: T
    at: number
    ttlMs?: number
  }): Promise<void> {
    await db.runtime_cache.put(entry)
  },

  async deleteRuntimeCacheEntry(key: string): Promise<void> {
    await db.runtime_cache.delete(key)
  },

  async deleteRuntimeCacheEntries(keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await db.runtime_cache.bulkDelete(keys)
  },

  async getRuntimeCacheEntriesByNamespace(namespace: string): Promise<RuntimeCacheEntry[]> {
    return db.runtime_cache.where('namespace').equals(namespace).toArray()
  },

  async getRuntimeCacheEntriesByNamespaces(namespaces: string[]): Promise<RuntimeCacheEntry[]> {
    if (namespaces.length === 0) return []
    return db.runtime_cache.where('namespace').anyOf(namespaces).toArray()
  },

  async clearRuntimeCacheByNamespaces(namespaces: string[]): Promise<void> {
    if (namespaces.length === 0) return
    await db.transaction('rw', [db.runtime_cache], async () => {
      const keys = await db.runtime_cache.where('namespace').anyOf(namespaces).primaryKeys()
      await db.runtime_cache.bulkDelete(keys)
    })
  },

  // ========== files CRUD ==========

  // Folders
  async addFolder(name: string): Promise<string> {
    const folder: FileFolder = {
      id: generateId(),
      name,
      createdAt: Date.now(),
    }
    await db.folders.add(folder)
    return folder.id
  },

  async getFolder(id: string): Promise<FileFolder | undefined> {
    return db.folders.get(id)
  },

  async getAllFolders(): Promise<FileFolder[]> {
    return db.folders.orderBy('createdAt').toArray()
  },

  async deleteFolder(id: string): Promise<void> {
    return db.transaction(
      'rw',
      [
        db.folders,
        db.tracks,
        db.local_subtitles,
        db.audioBlobs,
        db.subtitles,
        db.playback_sessions,
      ],
      async () => {
        // Delete all tracks in this folder
        const tracks = await db.tracks.where('folderId').equals(id).toArray()
        // Delete tracks sequentially to ensure blob cleanup
        for (const track of tracks) {
          await this.deleteFileTrack(track.id)
        }
        await db.folders.delete(id)
      }
    )
  },

  async updateFolder(
    id: string,
    data: Partial<Pick<FileFolder, 'name' | 'pinnedAt'>>
  ): Promise<void> {
    await db.folders.update(id, data)
  },

  // File Tracks (Mapped to tracks where sourceType = TRACK_SOURCE.USER_UPLOAD)
  async addFileTrack(data: Omit<FileTrack, 'id' | 'createdAt' | 'sourceType'>): Promise<string> {
    const track: FileTrack = {
      id: generateId(),
      ...data,
      folderId: toStoredFolderId(data.folderId),
      sourceType: TRACK_SOURCE.USER_UPLOAD,
      createdAt: Date.now(),
    }
    await db.tracks.add(track)
    return track.id
  },

  /**
   * Apply partial updates to any track regardless of sourceType.
   * Primary use case: retention and integrity self-healing.
   */
  async updateTrackPatch(id: string, patch: Partial<Track>): Promise<boolean> {
    const normalizedPatch = { ...patch }
    if ('folderId' in normalizedPatch) {
      normalizedPatch.folderId = toStoredFolderId(normalizedPatch.folderId)
    }
    const updated = await db.tracks.update(id, normalizedPatch)
    return updated > 0
  },

  async updateFileTrack(id: string, updates: Partial<FileTrack>): Promise<void> {
    const normalizedUpdates = { ...updates }
    if ('folderId' in normalizedUpdates) {
      normalizedUpdates.folderId = toStoredFolderId(normalizedUpdates.folderId)
    }
    await db.tracks.update(id, normalizedUpdates)
  },

  async getFileTrack(id: string): Promise<FileTrack | undefined> {
    const track = await db.tracks.get(id)
    if (isUserUploadTrack(track)) return toPublicFileTrack(track)
    return undefined
  },

  async getFileTracksInFolder(folderId: string | null | undefined): Promise<FileTrack[]> {
    const normalizedFolderId = toStoredFolderId(folderId)
    const primaryResults = await db.tracks
      .where('[sourceType+folderId+createdAt]')
      .between(
        [TRACK_SOURCE.USER_UPLOAD, normalizedFolderId, Dexie.minKey],
        [TRACK_SOURCE.USER_UPLOAD, normalizedFolderId, Dexie.maxKey]
      )
      .reverse()
      .toArray()
    return (primaryResults as FileTrack[]).map(toPublicFileTrack)
  },

  async getFileTracksCountInFolder(folderId: string | null | undefined): Promise<number> {
    const normalizedFolderId = toStoredFolderId(folderId)
    const sentinelCount = await db.tracks
      .where('[sourceType+folderId]')
      .equals([TRACK_SOURCE.USER_UPLOAD, normalizedFolderId] as import('dexie').IndexableType)
      .count()

    return sentinelCount
  },

  async getAllFileTracks(): Promise<FileTrack[]> {
    const tracks = await db.tracks
      .where('[sourceType+createdAt]')
      .between([TRACK_SOURCE.USER_UPLOAD, Dexie.minKey], [TRACK_SOURCE.USER_UPLOAD, Dexie.maxKey])
      .reverse()
      .toArray()
    return (tracks as FileTrack[]).map(toPublicFileTrack)
  },

  async getAllTrackIds(): Promise<string[]> {
    const ids = await db.tracks.toCollection().primaryKeys()
    return ids as string[]
  },

  async iterateAllTracks(callback: (track: Track) => void | Promise<void>): Promise<void> {
    await db.tracks.toCollection().each(callback)
  },

  async deleteFileTrack(id: string): Promise<void> {
    return db.transaction(
      'rw',
      [db.tracks, db.local_subtitles, db.audioBlobs, db.subtitles, db.playback_sessions],
      async () => {
        const track = await db.tracks.get(id)
        if (!isUserUploadTrack(track)) {
          if (track) {
            warn(
              `[DB] deleteFileTrack: sourceType mismatch for ${id}. Expected USER_UPLOAD, got ${track.sourceType}`
            )
          }
          return
        }

        // Delete associated subtitles (and their stored subtitle blobs)
        const fileSubs = await db.local_subtitles.where('trackId').equals(id).toArray()
        for (const fileSub of fileSubs) {
          await this.deleteFileSubtitle(fileSub.id)
        }

        if (track.audioId) {
          await clearLocalPlaybackSessionAudioRefs(id, track.audioId)
          await deleteAudioBlobIfUnreferenced(track.audioId, id)
        }

        if (track.artworkId) {
          await deleteArtworkBlobIfUnreferenced(track.artworkId, id)
        }

        await db.tracks.delete(id)
      }
    )
  },

  async searchPlaybackSessionsByTitle(query: string, limit = 200): Promise<PlaybackSession[]> {
    if (!query) return []
    // Use index for O(log N) search
    return db.playback_sessions.where('title').startsWithIgnoreCase(query).limit(limit).toArray()
  },

  async searchSessionsByAudioUrls(urls: string[]): Promise<PlaybackSession[]> {
    if (!urls.length) return []
    return db.playback_sessions.where('audioUrl').anyOf(urls).toArray()
  },

  async getPlaybackSessionsByShortGuid(shortId: string): Promise<PlaybackSession[]> {
    // Use startsWithIgnoreCase to match GUID prefixes stored in episodeGuid
    return db.playback_sessions
      .where('episodeGuid')
      .startsWithIgnoreCase(shortId)
      .limit(5)
      .toArray()
  },

  async searchFileTracksByName(query: string, limit = 200): Promise<FileTrack[]> {
    if (!query) return []
    const tracks = await db.tracks.where('name').startsWithIgnoreCase(query).limit(limit).toArray()
    return tracks.filter(isUserUploadTrack)
  },

  // Podcast Downloads (Mapped to tracks where sourceType = TRACK_SOURCE.PODCAST_DOWNLOAD)
  async addPodcastDownload(data: PodcastDownloadCreateInput): Promise<string> {
    const download: PodcastDownload = {
      id: generateId(),
      ...data,
      sourceType: TRACK_SOURCE.PODCAST_DOWNLOAD,
      createdAt: Date.now(),
    }
    await db.tracks.add(download)
    return download.id
  },

  async getPodcastDownloadByUrl(url: string): Promise<PodcastDownload | undefined> {
    const track = await db.tracks
      .where('[sourceType+sourceUrlNormalized]')
      .equals([TRACK_SOURCE.PODCAST_DOWNLOAD, url])
      .first()
    return track as PodcastDownload | undefined
  },

  async getAllPodcastDownloads(): Promise<PodcastDownload[]> {
    const tracks = await db.tracks
      .where('[sourceType+createdAt]')
      .between(
        [TRACK_SOURCE.PODCAST_DOWNLOAD, Dexie.minKey],
        [TRACK_SOURCE.PODCAST_DOWNLOAD, Dexie.maxKey]
      )
      .reverse()
      .toArray()
    return tracks as PodcastDownload[]
  },

  async updatePodcastDownload(id: string, updates: Partial<PodcastDownload>): Promise<void> {
    await db.tracks.update(id, updates)
  },

  async removePodcastDownloadWithCleanup(id: string): Promise<boolean> {
    return db.transaction(
      'rw',
      [db.tracks, db.audioBlobs, db.subtitles, db.local_subtitles, db.playback_sessions],
      async () => {
        const download = await db.tracks.get(id)
        if (!isPodcastDownloadTrack(download)) {
          if (download) {
            warn(
              `[DB] deletePodcastDownload: sourceType mismatch for ${id}. Expected PODCAST_DOWNLOAD, got ${download.sourceType}`
            )
          }
          return false
        }

        const fileSubs = await db.local_subtitles.where('trackId').equals(id).toArray()
        for (const fileSub of fileSubs) {
          await this.deleteFileSubtitle(fileSub.id)
        }

        await clearLocalPlaybackSessionAudioRefs(id, download.audioId)
        await deleteAudioBlobIfUnreferenced(download.audioId, id)

        if (download.artworkId) {
          await deleteArtworkBlobIfUnreferenced(download.artworkId, id)
        }

        await db.tracks.delete(id)
        return true
      }
    )
  },

  async searchPodcastDownloadsByName(query: string, limit = 200): Promise<PodcastDownload[]> {
    if (!query) return []
    const tracks = await db.tracks.where('name').startsWithIgnoreCase(query).limit(limit).toArray()
    return tracks.filter(isPodcastDownloadTrack)
  },

  // File subtitles
  async addFileSubtitle(
    data: Omit<FileSubtitle, 'id' | 'createdAt'> & Partial<Pick<FileSubtitle, 'createdAt'>>
  ): Promise<string> {
    const fileSub: FileSubtitle = {
      id: generateId(),
      createdAt: Date.now(),
      ...data,
    }
    await db.local_subtitles.add(fileSub)
    return fileSub.id
  },

  async getFileSubtitlesForTrack(trackId: string): Promise<FileSubtitle[]> {
    const subtitles = await db.local_subtitles.where('trackId').equals(trackId).toArray()
    return subtitles.sort(compareFileSubtitlesForDisplay)
  },

  async iterateAllLocalSubtitles(
    callback: (sub: FileSubtitle) => void | Promise<void>
  ): Promise<void> {
    await db.local_subtitles.toCollection().each(callback)
  },

  async deleteLocalSubtitlesBulk(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    await db.local_subtitles.bulkDelete(ids)
    return ids.length
  },

  async iterateAllPlaybackSessions(
    callback: (session: PlaybackSession) => void | Promise<void>
  ): Promise<void> {
    await db.playback_sessions.toCollection().each(callback)
  },

  async deleteFileSubtitle(id: string): Promise<void> {
    return db.transaction('rw', [db.local_subtitles, db.subtitles], async () => {
      await deleteFileSubtitleWithBlobProtection(id)
    })
  },

  async deleteDownloadSubtitleVersion(trackId: string, fileSubtitleId: string): Promise<boolean> {
    return db.transaction('rw', [db.tracks, db.local_subtitles, db.subtitles], async () => {
      const download = await db.tracks.get(trackId)
      if (!isPodcastDownloadTrack(download)) {
        if (import.meta.env.DEV) {
          warn('[DB] deleteDownloadSubtitleVersion blocked: invalid download track', {
            trackId,
          })
        }
        return false
      }

      const version = await db.local_subtitles.get(fileSubtitleId)
      if (!version || version.trackId !== trackId) {
        if (import.meta.env.DEV) {
          warn('[DB] deleteDownloadSubtitleVersion blocked: version mismatch', {
            fileSubtitleId,
            trackId,
          })
        }
        return false
      }

      await deleteFileSubtitleWithBlobProtection(fileSubtitleId)

      if (download.activeSubtitleId === fileSubtitleId) {
        const remaining = await db.local_subtitles.where('trackId').equals(trackId).toArray()
        const readyVersions = remaining
          .filter((v) => v.status === 'ready' || v.status === undefined)
          .sort((a, b) => b.createdAt - a.createdAt)

        const fallbackId = readyVersions.length > 0 ? readyVersions[0].id : undefined
        await db.tracks.update(trackId, {
          activeSubtitleId: fallbackId,
        })
      }

      return true
    })
  },

  async transaction<T>(
    mode: 'r' | 'rw',
    tables: Array<DbTableName | ReadioTable>,
    callback: () => Promise<T>
  ): Promise<T> {
    const resolvedTables = tables.map((table) =>
      typeof table === 'string' ? DB_TABLE_OBJECTS[table] : table
    )
    return db.transaction(mode, resolvedTables, callback)
  },

  // ========== Development Utilities ==========
  async clearAllData(): Promise<void> {
    log('[DB] Clearing all data...')
    try {
      await db.transaction(
        'rw',
        [
          db.playback_sessions,
          db.audioBlobs,
          db.subtitles,
          db.remote_transcripts,
          db.subscriptions,
          db.favorites,
          db.settings,
          db.credentials,
          db.runtime_cache,
          db.folders,
          db.tracks,
          db.local_subtitles,
        ],
        async () => {
          await db.playback_sessions.clear()
          await db.audioBlobs.clear()
          await db.subtitles.clear()
          await db.remote_transcripts.clear()
          await db.subscriptions.clear()
          await db.favorites.clear()
          await db.settings.clear()
          await db.credentials.clear()
          await db.runtime_cache.clear()
          await db.folders.clear()
          await db.tracks.clear()
          await db.local_subtitles.clear()
        }
      )
      log('[DB] All stores cleared')
    } catch (err) {
      logError('[DB] Failed to clear data:', err)
      throw err
    }
  },
}
