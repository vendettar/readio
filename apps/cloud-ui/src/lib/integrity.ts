import { isUserUploadTrack, ROOT_FOLDER_ID } from './db/types'
import type { MinimalSubscription } from './opmlParser'
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
  // Vault is a full backup/restore; we enforce strict uniqueness for feeds and favorites.
  const feedUrls = new Set<string>()
  for (const sub of data.subscriptions) {
    if (feedUrls.has(sub.feedUrl)) {
      return { isValid: false, error: `Duplicate subscription feedUrl: ${sub.feedUrl}` }
    }
    feedUrls.add(sub.feedUrl)
  }

  const favKeys = new Set<string>()
  for (const fav of data.favorites) {
    if (favKeys.has(fav.key)) {
      return { isValid: false, error: `Duplicate favorite key: ${fav.key}` }
    }
    favKeys.add(fav.key)
  }

  return { isValid: true }
}

/**
 * Performs business-level integrity checks on OPML import items.
 */
export function verifyOpmlIntegrity(_items: MinimalSubscription[]): IntegrityResult {
  // OPML integrity is now handled by merge+dedup semantics.
  // We allow duplicates here; the parser will de-duplicate them.
  return { isValid: true }
}
