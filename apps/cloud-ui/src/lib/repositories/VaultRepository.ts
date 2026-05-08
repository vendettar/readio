import type {
  Favorite,
  FileFolder,
  FileSubtitle,
  FileTrack,
  PlaybackSession,
  PodcastDownload,
  Setting,
  Subscription,
} from '../dexieDb'
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
        await db.folders.clear()
        await db.tracks.clear()
        await db.local_subtitles.clear()
        await db.subscriptions.clear()
        await db.favorites.clear()
        await db.playback_sessions.clear()
        await db.settings.clear()

        await db.folders.bulkAdd(snapshot.folders)
        await db.tracks.bulkAdd(snapshot.tracks)
        await db.local_subtitles.bulkAdd(snapshot.localSubtitles)
        await db.subscriptions.bulkAdd(snapshot.subscriptions)
        await db.favorites.bulkAdd(snapshot.favorites)
        await db.playback_sessions.bulkAdd(snapshot.playbackSessions)
        await db.settings.bulkAdd(snapshot.settings)
      }
    )
  },
}
