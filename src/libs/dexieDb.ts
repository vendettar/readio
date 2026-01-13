// src/libs/dexieDb.ts
// IndexedDB via Dexie for session persistence and  file storage
import Dexie, { type EntityTable } from 'dexie'
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
  localTrackId?: number // FK to local_tracks.id

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
  feedUrl: string // Primary key
  title: string
  author: string
  artworkUrl: string
  addedAt: number
  providerPodcastId?: string // Apple provider collection ID for navigation
}

export interface Favorite {
  key: string // Primary key: feedUrl::audioUrl
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
}

export interface Setting {
  key: string // Primary key
  value: string
  updatedAt: number
}

// File interfaces
export interface FileFolder {
  id?: number // Auto-increment primary key
  name: string
  createdAt: number
  pinnedAt?: number // If set, folder is pinned; value is timestamp for stable ordering
}

export interface FileTrack {
  id?: number // Auto-increment primary key
  folderId: number | null | undefined // null = root folder
  name: string
  audioId: string // FK to audioBlobs
  sizeBytes: number // Raw size in bytes
  durationSeconds?: number // Duration in seconds
  createdAt: number
  activeSubtitleId?: number // FK to local_subtitles.id - which subtitle is active
}

export interface FileSubtitle {
  id?: number // Auto-increment primary key
  trackId: number // FK to local_tracks
  name: string
  subtitleId: string // FK to subtitles
}

// Dexie database class
class ReadioDB extends Dexie {
  playback_sessions!: EntityTable<PlaybackSession, 'id'>
  audioBlobs!: EntityTable<AudioBlob, 'id'>
  subtitles!: EntityTable<SubtitleText, 'id'>

  // Subscriptions/favorites
  subscriptions!: EntityTable<Subscription, 'feedUrl'>
  favorites!: EntityTable<Favorite, 'key'>
  settings!: EntityTable<Setting, 'key'>

  // files
  folders!: EntityTable<FileFolder, 'id'>
  local_tracks!: EntityTable<FileTrack, 'id'>
  local_subtitles!: EntityTable<FileSubtitle, 'id'>

  constructor() {
    super(getDbName())

    // Single-version schema: no historical migrations (first-release policy)
    this.version(1).stores({
      playback_sessions:
        'id, lastPlayedAt, source, createdAt, audioUrl, audioFilename, localTrackId, episodeId',
      audioBlobs: 'id, storedAt',
      subtitles: 'id, storedAt',
      subscriptions: 'feedUrl, addedAt, providerPodcastId',
      favorites: 'key, addedAt, episodeId',
      settings: 'key',
      folders: '++id, name, createdAt',
      local_tracks: '++id, folderId, createdAt',
      local_subtitles: '++id, trackId',
    })
  }
}

const db = new ReadioDB()

function generateId(): string {
  return crypto.randomUUID()
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

  async updatePlaybackSession(id: string, updates: Partial<PlaybackSession>): Promise<void> {
    const existing = await db.playback_sessions.get(id)
    if (!existing) {
      throw new Error(`Playback session ${id} not found`)
    }
    await db.playback_sessions.put({
      ...existing,
      ...updates,
      lastPlayedAt: Date.now(),
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

  async findLastSessionByTrackId(trackId: number): Promise<PlaybackSession | undefined> {
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
    const item = await db.playback_sessions.get(id)
    if (item) {
      // Delete associated blobs
      if (item.audioId) await this.deleteAudioBlob(item.audioId)
      if (item.subtitleId) await this.deleteSubtitle(item.subtitleId)
    }
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
      type: 'srt',
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
  async addSubscription(sub: Subscription): Promise<void> {
    await db.subscriptions.put(sub)
  },

  async removeSubscription(feedUrl: string): Promise<void> {
    await db.subscriptions.delete(feedUrl)
  },

  async getAllSubscriptions(): Promise<Subscription[]> {
    return db.subscriptions.orderBy('addedAt').reverse().toArray()
  },

  // ========== Favorites CRUD ==========
  async addFavorite(fav: Favorite): Promise<void> {
    await db.favorites.put(fav)
  },

  async removeFavorite(key: string): Promise<void> {
    await db.favorites.delete(key)
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
  async addFolder(name: string): Promise<number> {
    const folder: FileFolder = {
      name,
      createdAt: Date.now(),
    }
    return (await db.folders.add(folder)) as number
  },

  async getFolder(id: number): Promise<FileFolder | undefined> {
    return db.folders.get(id)
  },

  async getAllFolders(): Promise<FileFolder[]> {
    return db.folders.orderBy('createdAt').toArray()
  },

  async deleteFolder(id: number): Promise<void> {
    // Delete all tracks in this folder
    const tracks = await db.local_tracks.where('folderId').equals(id).toArray()
    // Delete tracks sequentially to ensure blob cleanup
    for (const track of tracks) {
      if (track.id) await this.deleteFileTrack(track.id)
    }
    await db.folders.delete(id)
  },

  async updateFolder(
    id: number,
    data: Partial<Pick<FileFolder, 'name' | 'pinnedAt'>>
  ): Promise<void> {
    await db.folders.update(id, data)
  },

  // File Tracks
  async addFileTrack(data: Omit<FileTrack, 'id' | 'createdAt'>): Promise<number> {
    const track: FileTrack = {
      ...data,
      createdAt: Date.now(),
    }
    return (await db.local_tracks.add(track)) as number
  },

  async updateFileTrack(id: number, updates: Partial<FileTrack>): Promise<void> {
    await db.local_tracks.update(id, updates)
  },

  async getFileTrack(id: number): Promise<FileTrack | undefined> {
    return db.local_tracks.get(id)
  },

  async getFileTracksInFolder(folderId: number | null): Promise<FileTrack[]> {
    if (folderId === null) {
      return db.local_tracks
        .filter((t) => t.folderId === null || t.folderId === undefined)
        .toArray()
    }
    return db.local_tracks.where('folderId').equals(folderId).toArray()
  },

  async getFileTracksCountInFolder(folderId: number): Promise<number> {
    return db.local_tracks.where('folderId').equals(folderId).count()
  },

  async getAllFileTracks(): Promise<FileTrack[]> {
    return db.local_tracks.orderBy('createdAt').reverse().toArray()
  },

  async deleteFileTrack(id: number): Promise<void> {
    const track = await db.local_tracks.get(id)
    if (track) {
      // Delete associated subtitles (and their stored subtitle blobs)
      const fileSubs = await db.local_subtitles.where('trackId').equals(id).toArray()
      for (const fileSub of fileSubs) {
        if (fileSub.id) {
          await this.deleteFileSubtitle(fileSub.id)
        }
      }
      // Delete associated audio blob
      if (track.audioId) {
        await this.deleteAudioBlob(track.audioId)
      }
    }
    await db.local_tracks.delete(id)
  },

  async searchPlaybackSessionsByTitle(query: string, limit = 200): Promise<PlaybackSession[]> {
    const normalized = query.toLowerCase()
    if (!normalized) return []
    return db.playback_sessions
      .orderBy('lastPlayedAt')
      .reverse()
      .filter((session) => (session.title || '').toLowerCase().includes(normalized))
      .limit(limit)
      .toArray()
  },

  async searchFileTracksByName(query: string, limit = 200): Promise<FileTrack[]> {
    const normalized = query.toLowerCase()
    if (!normalized) return []
    return db.local_tracks
      .orderBy('createdAt')
      .reverse()
      .filter((track) => (track.name || '').toLowerCase().includes(normalized))
      .limit(limit)
      .toArray()
  },

  // File subtitles
  async addFileSubtitle(data: Omit<FileSubtitle, 'id'>): Promise<number> {
    return (await db.local_subtitles.add(data)) as number
  },

  async getFileSubtitlesForTrack(trackId: number): Promise<FileSubtitle[]> {
    return db.local_subtitles.where('trackId').equals(trackId).toArray()
  },

  async deleteFileSubtitle(id: number): Promise<void> {
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
