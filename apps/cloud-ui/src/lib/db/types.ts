/**
 * Database Entity Types
 *
 * This module provides a stable type surface for UI components and hooks.
 * These types mirror the entity definitions in dexieDb.ts without exposing
 * implementation details or runtime database operations.
 *
 * IMPORTANT: This file exports types plus a small set of shared runtime
 * constants/helpers used for folder-id normalization.
 *
 * Ownership:
 * - dexieDb.ts remains the single source of truth for schema & runtime operations
 * - This file is the public type surface for UI layer consumption and shared
 *   domain constants/helpers
 */

export interface PlaybackSession {
  id: string // Primary key
  source: 'local' | 'explore' // Origin of content
  title: string // Display name

  // Metadata
  createdAt: number // Timestamp
  lastPlayedAt: number // Timestamp
  sizeBytes: number // Total size (audio + subtitle)
  durationSeconds: number // audio duration in seconds

  // References to blobs
  audioId: string | null // FK to audioBlobs (nullable if >300MB)
  subtitleId: string | null // FK to subtitles

  // Flags
  hasAudioBlob: boolean // True if audio is cached in IndexedDB

  // Playback state
  progress: number // Last playback position in seconds

  // File metadata
  audioFilename: string
  subtitleFilename: string

  // Resume Playback (added in v3)
  audioUrl?: string
  //  file tracking (added in v4)
  localTrackId?: string | null // FK to tracks.id (UUID) (nullable)

  // Episode metadata for History display (v5)
  artworkUrl?: string // Cover art URL
  description?: string // Episode description
  podcastTitle?: string // Podcast name
  podcastFeedUrl?: string // Feed URL for favorite operations
  publishedAt?: number // Episode publishing date (timestamp)
  episodeGuid?: string // Stable episode identity for compact route generation (v7)
  podcastItunesId?: string // Platform-specific podcast ID for navigation (v6)
  providerEpisodeId?: string // Platform-specific episode ID for deterministic history matching
  transcriptUrl?: string // Podcast transcript source URL (Podcasting 2.0)
  countryAtSave?: string // Country snapshot when the record was persisted
}

export interface AudioBlob {
  id: string
  blob: Blob
  size: number
  type: string
  filename: string
  storedAt: number
}

import type { ASRCue } from '../asr/types'

export interface SubtitleText {
  id: string
  cues: ASRCue[]
  cueSchemaVersion: number // Current version = 1
  asrFingerprint?: string // SHA-256 fingerprint for deduplication (Instruction 125)
  size: number
  filename: string
  storedAt: number
}

export interface Subscription {
  id: string // UUID Primary key
  feedUrl: string // Unique index for deduplication
  title: string
  author: string
  artworkUrl: string
  addedAt: number
  podcastItunesId?: string // Apple provider collection ID for navigation
  countryAtSave?: string // Country snapshot when subscribed
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
  durationSeconds?: number // Duration in seconds
  episodeArtworkUrl?: string // Episode-specific artwork
  episodeGuid?: string // Stable episode identity for compact route generation (v7)
  podcastItunesId?: string // Platform-specific podcast ID for navigation (v6)
  providerEpisodeId?: string // Platform-specific ID (e.g. Apple Track ID) for robust matching
  transcriptUrl?: string // Podcast transcript source URL (Podcasting 2.0)
  countryAtSave?: string // Country snapshot when favorited
}

export interface RemoteTranscriptCache {
  id: string // Stable cache identity derived from normalized URL
  url: string // Canonical transcript URL
  cues: ASRCue[]
  cueSchemaVersion: number // Current version = 1
  asrFingerprint?: string // SHA-256 fingerprint for deduplication (Instruction 125)
  fetchedAt: number // Last successful fetch timestamp
  contentType?: string // Response content type, if available
  cueCount?: number // Parsed cue count
  source?: 'podcast-transcript' | string
}

export interface Setting {
  key: string // Primary key
  value: string
  updatedAt: number
}

export interface CredentialEntry {
  key: string // Primary key: provider_<vendor>_key
  value: string
  updatedAt: number
}

export interface RuntimeCacheEntry {
  key: string // Primary key: namespace:key
  namespace: string
  data: unknown
  at: number
  ttlMs?: number
}

// File interfaces
export interface FileFolder {
  id: string // UUID primary key
  name: string
  createdAt: number
  pinnedAt?: number // If set, folder is pinned; value is timestamp for stable ordering
}

export const TRACK_SOURCE = {
  USER_UPLOAD: 'user_upload',
  PODCAST_DOWNLOAD: 'podcast_download',
} as const
export type TrackSource = (typeof TRACK_SOURCE)[keyof typeof TRACK_SOURCE]

// SSOT sentinel for storing root-folder tracks in IndexedDB while preserving
// the public API contract (callers still use null/undefined for root).
export const ROOT_FOLDER_ID = '__readio_root__' as const

export function toStoredFolderId(folderId: string | null | undefined): string {
  return typeof folderId === 'string' && folderId.length > 0 ? folderId : ROOT_FOLDER_ID
}

export function fromStoredFolderId(folderId: string | null | undefined): string | null {
  if (!folderId || folderId === ROOT_FOLDER_ID) return null
  return folderId
}

export interface TrackBase {
  id: string // UUID primary key
  name: string
  audioId: string // FK to audioBlobs
  sizeBytes: number // Raw size in bytes
  durationSeconds?: number // Duration in seconds
  createdAt: number
  artworkId?: string // FK to audioBlobs (embedded cover art)
  isCorrupted?: boolean // Added by Self-Healing Sanitizer if audio blob is missing
  activeSubtitleId?: string // FK to local_subtitles.id - which subtitle version is active
}

export interface UserUploadTrack extends TrackBase {
  sourceType: typeof TRACK_SOURCE.USER_UPLOAD
  folderId: string | null // Public contract: null = root folder
  album?: string // Album name from metadata
  artist?: string // Artist name from metadata
}

export interface PodcastDownloadTrack extends TrackBase {
  sourceType: typeof TRACK_SOURCE.PODCAST_DOWNLOAD
  sourceUrlNormalized: string // Normalized episode audio URL for dedup
  transcriptUrl?: string // Podcast transcript source URL (Podcasting 2.0)
  sourceFeedUrl?: string // Source RSS feed URL for favorite/navigation
  lastAccessedAt: number // Last playback access timestamp (throttled)
  sourcePodcastTitle?: string // Display podcast title
  sourceEpisodeTitle?: string // Display episode title
  sourceDescription?: string // Episode description
  sourceArtworkUrl?: string // Episode/podcast artwork URL
  downloadedAt: number // Download completion timestamp
  countryAtSave: string // Country at time of download for routing (required invariant)
  sourcePodcastItunesId?: string // Provider podcast ID
  sourceProviderEpisodeId?: string // Provider episode ID
  sourceEpisodeGuid?: string // Stable episode identity for compact route generation (v7)
  manualPinnedAt?: number // Timestamp when user manually selected active subtitle (Instruction 125b)
}

export type Track = UserUploadTrack | PodcastDownloadTrack

/**
 * Type guard for UserUploadTrack
 */
export function isUserUploadTrack(track: unknown): track is UserUploadTrack {
  return (
    typeof track === 'object' &&
    track !== null &&
    'sourceType' in track &&
    track.sourceType === TRACK_SOURCE.USER_UPLOAD
  )
}

/**
 * Type guard for PodcastDownloadTrack
 */
export function isPodcastDownloadTrack(track: unknown): track is PodcastDownloadTrack {
  return (
    typeof track === 'object' &&
    track !== null &&
    'sourceType' in track &&
    track.sourceType === TRACK_SOURCE.PODCAST_DOWNLOAD
  )
}

// Keep aliases for backward compatibility in the rest of the app, to be refactored in 127d2
export type FileTrack = UserUploadTrack
export type PodcastDownload = PodcastDownloadTrack

export type SubtitleSourceKind = 'manual_upload' | 'asr_online' | 'asr_background' | 'built_in'
export type SubtitleVersionStatus = 'ready' | 'failed'

export interface FileSubtitle {
  id: string // UUID primary key
  trackId: string // FK to tracks
  name: string
  subtitleId: string // FK to subtitles
  // Version metadata (Instruction 125b)
  sourceKind?: SubtitleSourceKind
  provider?: string // ASR provider name (e.g., 'groq')
  model?: string // ASR model name
  language?: string // Detected/declared language
  createdAt?: number // Version creation timestamp
  status?: SubtitleVersionStatus // 'ready' or 'failed'
}
