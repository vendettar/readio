// src/lib/dexieDb.ts
// IndexedDB via Dexie for session persistence and  file storage
import Dexie, { type EntityTable } from 'dexie'
import { createId } from './id'
import { log, error as logError } from './logger'
import { getAppConfig } from './runtimeConfig'

// Use new database name - fresh start per first-release policy
const getDbName = () => getAppConfig().DB_NAME

export interface PlaybackSession {
  id: string // Primary key
  source: 'local' | 'explore' // Origin of content
  title: string // Display name

  // Metadata
  createdAt: number // Timestamp
  lastPlayedAt: number // Timestamp
  sizeBytes: number // Total size (audio + subtitle)
  duration: number // audio duration in seconds

  // References to blobs
  audioId: string | null // FK to audioBlobs (nullable if >300MB)
  subtitleId: string | null // FK to subtitles

  // Flags
  hasAudioBlob: boolean // True if audio is cached in IndexedDB
  subtitleType: 'srt' | 'vtt' | null // subtitle format

  // Playback state
  progress: number // Last playback position in seconds

  // File metadata
  audioFilename: string
  subtitleFilename: string

  // Resume Playback (added in v3)
  audioUrl?: string
  //  file tracking (added in v4)
  localTrackId?: string // FK to local_tracks.id (UUID)

  // Episode metadata for History display (v5)
  artworkUrl?: string // Cover art URL
  description?: string // Episode description
  podcastTitle?: string // Podcast name
  podcastFeedUrl?: string // Feed URL for favorite operations
  publishedAt?: number // Episode publishing date (timestamp)
  episodeId?: string // Episode GUID/ID for navigation (v6)
}

export interface AudioBlob {
  id: string
  blob: Blob
  size: number
  type: string
  filename: string
  storedAt: number
}

export interface SubtitleText {
  id: string
  content: string
  size: number
  filename: string
  type: 'srt' | 'vtt'
  storedAt: number
}

export interface Subscription {
  id: string // UUID Primary key
  feedUrl: string // Unique index for deduplication
  title: string
  author: string
  artworkUrl: string
  addedAt: number
  providerPodcastId?: string // Apple provider collection ID for navigation
}

export interface Favorite {
  id: string // UUID Primary key
  key: string // Unique index: feedUrl::audioUrl (for deduplication)
  feedUrl: string
  audioUrl: string
  episodeTitle: string
  podcastTitle: string
  artworkUrl: string
  addedAt: number
  // Episode metadata
  description?: string
  pubDate?: string // ISO date string
  duration?: number // Duration in seconds
  episodeArtworkUrl?: string // Episode-specific artwork
  episodeId?: string // Episode GUID/ID for navigation (v6)
  providerEpisodeId?: string // Platform-specific ID (e.g. Apple Track ID) for robust matching
}

export interface Setting {
  key: string // Primary key
  value: string
  updatedAt: number
}

// File interfaces
export interface FileFolder {
  id: string // UUID primary key
  name: string
  createdAt: number
  pinnedAt?: number // If set, folder is pinned; value is timestamp for stable ordering
}

export interface FileTrack {
  id: string // UUID primary key
  folderId: string | null | undefined // null = root folder
  name: string
  audioId: string // FK to audioBlobs
  sizeBytes: number // Raw size in bytes
  durationSeconds?: number // Duration in seconds
  createdAt: number
  activeSubtitleId?: string // FK to local_subtitles.id - which subtitle is active
  artworkId?: string // FK to audioBlobs (embedded cover art)
}

export interface FileSubtitle {
  id: string // UUID primary key
  trackId: string // FK to local_tracks
  name: string
  subtitleId: string // FK to subtitles
}

// Dexie database class
class ReadioDB extends Dexie {
  playback_sessions!: EntityTable<PlaybackSession, 'id'>
  audioBlobs!: EntityTable<AudioBlob, 'id'>
  subtitles!: EntityTable<SubtitleText, 'id'>

  // Subscriptions/favorites
  subscriptions!: EntityTable<Subscription, 'id'>
  favorites!: EntityTable<Favorite, 'id'>
  settings!: EntityTable<Setting, 'key'>

  // files
  folders!: EntityTable<FileFolder, 'id'>
  local_tracks!: EntityTable<FileTrack, 'id'>
  local_subtitles!: EntityTable<FileSubtitle, 'id'>

  constructor() {
    super(getDbName())

    // Single-version schema: no historical migrations (first-release policy)
    // UUID-based primary keys for cloud sync readiness
    this.version(1).stores({
      playback_sessions:
        'id, title, lastPlayedAt, source, createdAt, audioUrl, audioFilename, localTrackId, episodeId',
      audioBlobs: 'id, storedAt',
      subtitles: 'id, storedAt',
      subscriptions: 'id, &feedUrl, addedAt, providerPodcastId', // &feedUrl = unique index
      favorites: 'id, &key, addedAt, episodeId, providerEpisodeId', // &key = unique index
      settings: 'key',
      folders: 'id, name, createdAt', // UUID, no auto-increment
      local_tracks: 'id, name, folderId, createdAt', // UUID, no auto-increment
      local_subtitles: 'id, trackId', // UUID, no auto-increment
    })
  }
}

export const db = new ReadioDB()

// Use the centralized ID generator
function generateId(): string {
  return createId()
}

export const DB = {
  // ========== Playback Session CRUD ==========
  async createPlaybackSession(data: Partial<PlaybackSession>): Promise<string> {
    const item: PlaybackSession = {
      id: generateId(),
      source: 'local',
      title: 'Untitled',
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      sizeBytes: 0,
      duration: 0,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      subtitleType: null,
      progress: 0,
      audioFilename: '',
      subtitleFilename: '',
      // Spread incoming data to include new metadata fields and overrides
      ...data,
    }
    await db.playback_sessions.put(item)
    return item.id
  },

  async upsertPlaybackSession(data: Partial<PlaybackSession>): Promise<string> {
    const id = data.id || generateId()
    const existing = await db.playback_sessions.get(id)

    if (existing) {
      const updated: PlaybackSession = {
        ...existing,
        ...data,
        id, // Ensure ID is correct
        // Preserve these if not explicitly provided in data
        progress: data.progress !== undefined ? data.progress : existing.progress,
        duration: data.duration !== undefined ? data.duration : existing.duration,
        lastPlayedAt: data.lastPlayedAt !== undefined ? data.lastPlayedAt : existing.lastPlayedAt,
      }
      await db.playback_sessions.put(updated)
      return id
    }

    // Default to create behavior if not found
    return this.createPlaybackSession({ ...data, id })
  },

  async updatePlaybackSession(id: string, updates: Partial<PlaybackSession>): Promise<void> {
    const existing = await db.playback_sessions.get(id)
    if (!existing) {
      throw new Error(`Playback session ${id} not found`)
    }
    await db.playback_sessions.put({
      ...existing,
      ...updates,
      // Only update timestamp if explicitly provided, otherwise keep existing
      lastPlayedAt: updates.lastPlayedAt ?? existing.lastPlayedAt,
    })
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

  async findLastSessionByUrl(audioUrl: string): Promise<PlaybackSession | undefined> {
    // Find most recent session for this specific audio URL
    // CRITICAL: sortBy() ignores reverse(), so we sort then reverse the array
    const sessions = await db.playback_sessions
      .where('audioUrl')
      .equals(audioUrl)
      .sortBy('lastPlayedAt')
    // Return the LAST item (newest)
    return sessions.length > 0 ? sessions[sessions.length - 1] : undefined
  },

  async findLastSessionByTrackId(trackId: string): Promise<PlaybackSession | undefined> {
    // Find most recent session for this specific local track
    // CRITICAL: sortBy() ignores reverse(), so we sort then reverse the array
    const sessions = await db.playback_sessions
      .where('localTrackId')
      .equals(trackId)
      .sortBy('lastPlayedAt')
    // Return the LAST item (newest)
    return sessions.length > 0 ? sessions[sessions.length - 1] : undefined
  },

  async deletePlaybackSession(id: string): Promise<void> {
    // Note: We deliberately do NOT delete associated audio/subtitle blobs here.
    // Audio blobs are source files (possibly shared or managed by File Library).
    // Sessions are just playback records.
    await db.playback_sessions.delete(id)
  },

  // ========== audioBlob CRUD ==========
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
    await db.audioBlobs.delete(id)
  },

  // Clear all audio blobs but keep session metadata
  async clearAllAudioBlobs(): Promise<void> {
    await db.audioBlobs.clear()
    // Update sessions to reflect missing blobs
    const items = await db.playback_sessions.toArray()
    for (const item of items) {
      if (item.hasAudioBlob) {
        await db.playback_sessions.put({
          ...item,
          audioId: null,
          hasAudioBlob: false,
        })
      }
    }
  },

  // ========== subtitle CRUD ==========
  async addSubtitle(content: string, filename: string): Promise<string> {
    const id = generateId()
    const subtitle: SubtitleText = {
      id,
      content,
      size: new Blob([content]).size,
      filename,
      type: filename.split('.').pop()?.toLowerCase() === 'vtt' ? 'vtt' : 'srt',
      storedAt: Date.now(),
    }
    await db.subtitles.put(subtitle)
    return id
  },

  async getSubtitle(id: string): Promise<SubtitleText | undefined> {
    return db.subtitles.get(id)
  },

  async getAllSubtitles(): Promise<SubtitleText[]> {
    return db.subtitles.orderBy('storedAt').reverse().toArray()
  },

  async deleteSubtitle(id: string): Promise<void> {
    await db.subtitles.delete(id)
  },

  // ========== Utility ==========
  async getStorageStats(): Promise<{
    sessions: number
    audioBlobs: number
    subtitles: number
    totalSize: number
  }> {
    const sessions = await this.getAllPlaybackSessions()
    const audioBlobs = await this.getAllAudioBlobs()
    const subtitles = await this.getAllSubtitles()

    const totalSize =
      audioBlobs.reduce((sum, a) => sum + a.size, 0) + subtitles.reduce((sum, s) => sum + s.size, 0)

    return {
      sessions: sessions.length,
      audioBlobs: audioBlobs.length,
      subtitles: subtitles.length,
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

    const audioBlobsSize = audioBlobs.reduce((sum, a) => sum + a.size, 0)
    const subtitlesSize = subtitles.reduce((sum, s) => sum + s.size, 0)
    const totalSize = audioBlobsSize + subtitlesSize

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
    }
    await db.favorites.put(newFav)
    return newFav.id
  },

  async getFavoriteByKey(key: string): Promise<Favorite | undefined> {
    return db.favorites.where('key').equals(key).first()
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
    // Delete all tracks in this folder
    const tracks = await db.local_tracks.where('folderId').equals(id).toArray()
    // Delete tracks sequentially to ensure blob cleanup
    for (const track of tracks) {
      await this.deleteFileTrack(track.id)
    }
    await db.folders.delete(id)
  },

  async updateFolder(
    id: string,
    data: Partial<Pick<FileFolder, 'name' | 'pinnedAt'>>
  ): Promise<void> {
    await db.folders.update(id, data)
  },

  // File Tracks
  async addFileTrack(data: Omit<FileTrack, 'id' | 'createdAt'>): Promise<string> {
    const track: FileTrack = {
      id: generateId(),
      ...data,
      createdAt: Date.now(),
    }
    await db.local_tracks.add(track)
    return track.id
  },

  async updateFileTrack(id: string, updates: Partial<FileTrack>): Promise<void> {
    await db.local_tracks.update(id, updates)
  },

  async getFileTrack(id: string): Promise<FileTrack | undefined> {
    return db.local_tracks.get(id)
  },

  async getFileTracksInFolder(folderId: string | null): Promise<FileTrack[]> {
    if (folderId === null) {
      return db.local_tracks
        .filter((t) => t.folderId === null || t.folderId === undefined)
        .toArray()
    }
    return db.local_tracks.where('folderId').equals(folderId).toArray()
  },

  async getFileTracksCountInFolder(folderId: string): Promise<number> {
    return db.local_tracks.where('folderId').equals(folderId).count()
  },

  async getAllFileTracks(): Promise<FileTrack[]> {
    return db.local_tracks.orderBy('createdAt').reverse().toArray()
  },

  async deleteFileTrack(id: string): Promise<void> {
    const track = await db.local_tracks.get(id)
    if (track) {
      // Delete associated subtitles (and their stored subtitle blobs)
      const fileSubs = await db.local_subtitles.where('trackId').equals(id).toArray()
      for (const fileSub of fileSubs) {
        await this.deleteFileSubtitle(fileSub.id)
      }
      // Delete associated audio blob
      if (track.audioId) {
        await this.deleteAudioBlob(track.audioId)
      }
    }
    await db.local_tracks.delete(id)
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

  async searchFileTracksByName(query: string, limit = 200): Promise<FileTrack[]> {
    if (!query) return []
    // Use index for O(log N) search
    return db.local_tracks.where('name').startsWithIgnoreCase(query).limit(limit).toArray()
  },

  // File subtitles
  async addFileSubtitle(data: Omit<FileSubtitle, 'id'>): Promise<string> {
    const fileSub: FileSubtitle = {
      id: generateId(),
      ...data,
    }
    await db.local_subtitles.add(fileSub)
    return fileSub.id
  },

  async getFileSubtitlesForTrack(trackId: string): Promise<FileSubtitle[]> {
    return db.local_subtitles.where('trackId').equals(trackId).toArray()
  },

  async deleteFileSubtitle(id: string): Promise<void> {
    const sub = await db.local_subtitles.get(id)
    if (sub) {
      // Delete associated subtitle blob
      if (sub.subtitleId) {
        await this.deleteSubtitle(sub.subtitleId)
      }
    }
    await db.local_subtitles.delete(id)
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
          db.subscriptions,
          db.favorites,
          db.settings,
          db.folders,
          db.local_tracks,
          db.local_subtitles,
        ],
        async () => {
          await db.playback_sessions.clear()
          await db.audioBlobs.clear()
          await db.subtitles.clear()
          await db.subscriptions.clear()
          await db.favorites.clear()
          await db.settings.clear()
          await db.folders.clear()
          await db.local_tracks.clear()
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
