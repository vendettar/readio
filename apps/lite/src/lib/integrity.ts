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
    data.local_tracks,
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
  const trackIds = new Set(data.local_tracks.map((t) => t.id))
  const folderIds = new Set(data.folders.map((f) => f.id))

  for (const subtitle of data.local_subtitles) {
    if (!trackIds.has(subtitle.trackId)) {
      return {
        isValid: false,
        error: `Dangling subtitle reference: Track ${subtitle.trackId} not found`,
      }
    }
  }

  for (const track of data.local_tracks) {
    if (track.folderId && !folderIds.has(track.folderId)) {
      return {
        isValid: false,
        error: `Dangling track reference: Folder ${track.folderId} not found`,
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
    ...data.local_tracks.map((t) => t.createdAt),
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
export function verifyOpmlIntegrity(items: MinimalSubscription[]): IntegrityResult {
  const feedUrls = new Set<string>()

  for (const item of items) {
    if (feedUrls.has(item.xmlUrl)) {
      // Duplicate entries are allowed; import logic should dedupe instead of failing.
      continue
    }
    feedUrls.add(item.xmlUrl)
  }

  return { isValid: true }
}
