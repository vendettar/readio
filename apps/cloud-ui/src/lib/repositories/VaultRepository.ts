import {
  normalizeFavoriteRecord,
  normalizePlaybackSessionRecord,
  normalizeSubscriptionRecord,
} from '../db/recordNormalizers'
import type {
  Favorite,
  FileFolder,
  FileSubtitle,
  FileTrack,
  PlaybackSession,
  PodcastDownload,
  Setting,
  Subscription,
} from '../db/types'
import { db } from '../dexieDb'

export interface VaultMetadataSnapshot {
  folders: FileFolder[]
  tracks: Array<FileTrack | PodcastDownload>
  localSubtitles: FileSubtitle[]
  subscriptions: Subscription[]
  favorites: Favorite[]
  playbackSessions: PlaybackSession[]
  settings: Setting[]
}

export const VaultRepository = {
  async getMetadataSnapshot(): Promise<VaultMetadataSnapshot> {
    return db.transaction(
      'r',
      [
        db.folders,
        db.tracks,
        db.local_subtitles,
        db.subscriptions,
        db.favorites,
        db.playback_sessions,
        db.settings,
      ],
      async () => {
        const settings = await db.settings.toArray()
        const tracks = await db.tracks.toArray()
        const trackIds = new Set(tracks.map((track) => track.id))
        const localSubtitles = (await db.local_subtitles.toArray()).filter((subtitle) =>
          trackIds.has(subtitle.trackId)
        )

        return {
          folders: await db.folders.toArray(),
          tracks,
          localSubtitles,
          subscriptions: await db.subscriptions.toArray(),
          favorites: await db.favorites.toArray(),
          playbackSessions: await db.playback_sessions.toArray(),
          settings,
        }
      }
    )
  },

  /**
   * Replaces all metadata tables with the provided snapshot.
   * Performs normalization on subscriptions, favorites, and playback sessions
   * before adding them to the database.
   */
  async replaceMetadata(snapshot: VaultMetadataSnapshot): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.folders,
        db.tracks,
        db.local_subtitles,
        db.subscriptions,
        db.favorites,
        db.playback_sessions,
        db.settings,
      ],
      async () => {
        // 1. Normalize records before adding them
        const normalizedSubscriptions = snapshot.subscriptions.map((s) =>
          normalizeSubscriptionRecord(s, 'vault subscription')
        )
        const normalizedFavorites = snapshot.favorites.map((f) =>
          normalizeFavoriteRecord(f, 'vault favorite')
        )
        const normalizedPlaybackSessions = snapshot.playbackSessions.map((p) =>
          normalizePlaybackSessionRecord(p, 'vault playback session')
        )

        // 2. Clear existing data
        await db.folders.clear()
        await db.tracks.clear()
        await db.local_subtitles.clear()
        await db.subscriptions.clear()
        await db.favorites.clear()
        await db.playback_sessions.clear()
        await db.settings.clear()

        // 3. Bulk add new data
        await db.folders.bulkAdd(snapshot.folders)
        await db.tracks.bulkAdd(snapshot.tracks)
        await db.local_subtitles.bulkAdd(snapshot.localSubtitles)
        await db.subscriptions.bulkAdd(normalizedSubscriptions)
        await db.favorites.bulkAdd(normalizedFavorites)
        await db.playback_sessions.bulkAdd(normalizedPlaybackSessions)
        await db.settings.bulkAdd(snapshot.settings)
      }
    )
  },
}
