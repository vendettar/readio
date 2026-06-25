// src/lib/dexieDb.ts
// IndexedDB via Dexie for session persistence and  file storage
import type { Table } from 'dexie'
import { createAudioSubtitleDbMethods } from './db/audioSubtitleMethods'
import { createFileLibraryDbMethods } from './db/fileLibraryMethods'
import { createPlaybackSessionDbMethods } from './db/playbackSessionMethods'
import { createRemoteTranscriptDbMethods } from './db/remoteTranscriptMethods'
import { DB_TABLE_NAMES, db, type ReadioDB } from './db/schema'
import { createSettingsRuntimeDbMethods } from './db/settingsRuntimeMethods'
import { createStorageInfoDbMethods } from './db/storageInfoMethods'
import { createSubscriptionsFavoritesDbMethods } from './db/subscriptionsFavoritesMethods'
import type {
  AudioBlob,
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
import { isNavigableExplorePlaybackSession } from './db/types'
import { createId } from './id'
import { log, error as logError } from './logger'

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
export { DB_TABLE_NAMES, db }

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

export const DB = {
  ...createPlaybackSessionDbMethods(db, generateId, getAudioBlobReferenceCounts),

  ...createAudioSubtitleDbMethods(db, generateId, getAudioBlobReferenceCounts),

  ...createRemoteTranscriptDbMethods(db),

  ...createStorageInfoDbMethods(db),

  ...createSubscriptionsFavoritesDbMethods(db, generateId),

  ...createSettingsRuntimeDbMethods(db),

  ...createFileLibraryDbMethods(db, generateId, getAudioBlobReferenceCounts),

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
