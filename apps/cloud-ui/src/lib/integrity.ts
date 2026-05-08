import { buildFavoriteKey } from './db/favoriteIdentity'
import { isUserUploadTrack, ROOT_FOLDER_ID } from './db/types'
import type { VaultData } from './vault'

export interface IntegrityResult {
  isValid: boolean
  error?: string
}

interface HasId {
  id: string
}

/**
 * Reusable check: Is the subtitle pointing to a valid track or download?
 */
export function isSubtitleOrphaned(
  trackId: string,
  validTrackIds: Set<string>,
  validDownloadIds?: Set<string>
): boolean {
  if (validTrackIds.has(trackId)) return false
  if (validDownloadIds?.has(trackId)) return false
  return true
}

/**
 * Reusable check: Is the track pointing to a valid folder?
 */
export function isTrackFolderOrphaned(
  folderId: string | null | undefined,
  validFolderIds: Set<string>
): boolean {
  // Root folder sentinel is a valid storage value and must not be treated as dangling.
  if (!folderId || folderId === ROOT_FOLDER_ID) return false
  return !validFolderIds.has(folderId)
}

/**
 * Performs business-level integrity checks on the imported Vault data.
 * Ensures references are valid, IDs are unique, and timestamps make sense.
 */
export function verifyVaultIntegrity(vault: VaultData): IntegrityResult {
  const { data } = vault
  const now = Date.now()

  // 1. UUID Uniqueness Check in the incoming dataset
  const allIds = new Set<string>()
  const checkUnique = (id: string | undefined | null) => {
    if (!id) return true
    if (allIds.has(id)) return false
    allIds.add(id)
    return true
  }

  const collections: HasId[][] = [
    data.folders,
    data.tracks,
    data.local_subtitles,
    data.subscriptions,
    data.favorites,
    data.playback_sessions,
  ]

  for (const collection of collections) {
    for (const item of collection) {
      if (!checkUnique(item.id)) {
        return { isValid: false, error: `Duplicate ID detected: ${item.id}` }
      }
    }
  }

  // 2. Dangling References
  const trackIds = new Set(data.tracks.map((t) => t.id))
  const folderIds = new Set(data.folders.map((f) => f.id))

  for (const subtitle of data.local_subtitles) {
    if (isSubtitleOrphaned(subtitle.trackId, trackIds)) {
      return {
        isValid: false,
        error: `Dangling subtitle reference: Track ${subtitle.trackId} not found`,
      }
    }
  }

  for (const track of data.tracks) {
    if (isUserUploadTrack(track) && isTrackFolderOrphaned(track.folderId, folderIds)) {
      return {
        isValid: false,
        error: `Dangling track reference: Folder ${(track as import('./db/types').UserUploadTrack).folderId} not found`,
      }
    }
  }

  // 3. Playback Sessions Cross-Table integrity
  for (const session of data.playback_sessions) {
    if (session.source === 'local' && session.localTrackId && !trackIds.has(session.localTrackId)) {
      return {
        isValid: false,
        error: `Dangling session reference: Local track ${session.localTrackId} not found`,
      }
    }
  }

  // 4. Timestamp Sanity
  // We allow some clock skew (e.g., 24 hours) but not extreme future dates
  const MAX_SKEW = 24 * 60 * 60 * 1000
  const isFuture = (ts: number | undefined) => (ts ? ts > now + MAX_SKEW : false)

  const timestamped = [
    ...data.folders.map((f) => f.createdAt),
    ...data.tracks.map((t) => t.createdAt),
    ...data.subscriptions.map((s) => s.addedAt),
    ...data.favorites.map((f) => f.addedAt),
    ...data.playback_sessions.map((p) => p.createdAt),
    ...data.playback_sessions.map((p) => p.lastPlayedAt),
  ]

  for (const ts of timestamped) {
    if (isFuture(ts)) {
      return { isValid: false, error: 'Future timestamp detected in dataset' }
    }
  }

  // 5. De-duplication Check (within dataset)
  // Vault is a full backup/restore; we enforce strict uniqueness for subscriptions and favorites.
  const podcastItunesIds = new Set<string>()
  for (const sub of data.subscriptions) {
    const normalizedPodcastItunesId = sub.podcastItunesId.trim()
    if (!normalizedPodcastItunesId) {
      return { isValid: false, error: 'Invalid subscription podcastItunesId' }
    }
    if (podcastItunesIds.has(normalizedPodcastItunesId)) {
      return {
        isValid: false,
        error: `Duplicate subscription podcastItunesId: ${normalizedPodcastItunesId}`,
      }
    }
    podcastItunesIds.add(normalizedPodcastItunesId)
  }

  const favKeys = new Set<string>()
  for (const fav of data.favorites) {
    const normalizedFavoriteKey = buildFavoriteKey(fav.podcastItunesId, fav.episodeGuid)
    if (!normalizedFavoriteKey) {
      return { isValid: false, error: 'Invalid favorite canonical identity' }
    }
    if (favKeys.has(normalizedFavoriteKey)) {
      return { isValid: false, error: `Duplicate favorite key: ${normalizedFavoriteKey}` }
    }
    favKeys.add(normalizedFavoriteKey)
  }

  // 6. Canonical Identity Check for Tracks (podcast downloads)
  // Runtime now deduplicates downloads by canonical episode identity, so the
  // vault must reject duplicate canonical download rows.
  const downloadKeys = new Set<string>()
  for (const track of data.tracks) {
    if (track.sourceType === 'podcast_download') {
      if (!track.sourcePodcastItunesId || !track.sourceEpisodeGuid) {
        return { isValid: false, error: 'Podcast download missing canonical identity' }
      }
      const downloadKey = `${track.sourcePodcastItunesId}:${track.sourceEpisodeGuid}`
      if (downloadKeys.has(downloadKey)) {
        return { isValid: false, error: `Duplicate podcast download: ${downloadKey}` }
      }
      downloadKeys.add(downloadKey)
    }
  }

  // 7. Canonical Identity Check for Playback Sessions (explore/remote)
  // Runtime now reuses remote sessions by canonical episode identity, so the
  // vault must reject duplicate canonical remote sessions.
  const sessionKeys = new Set<string>()
  for (const session of data.playback_sessions) {
    if (session.source === 'explore') {
      if (!session.podcastItunesId || !session.episodeGuid) {
        return { isValid: false, error: 'Remote session missing canonical identity' }
      }
      const sessionKey = `${session.podcastItunesId}:${session.episodeGuid}`
      if (sessionKeys.has(sessionKey)) {
        return { isValid: false, error: `Duplicate remote session: ${sessionKey}` }
      }
      sessionKeys.add(sessionKey)
    }
  }

  return { isValid: true }
}
