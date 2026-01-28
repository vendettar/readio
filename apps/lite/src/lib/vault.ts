import { z } from 'zod'
import type {
  Favorite,
  FileFolder,
  FileSubtitle,
  FileTrack,
  PlaybackSession,
  Setting,
  Subscription,
} from './dexieDb'
import { db } from './dexieDb'
import { log, error as logError } from './logger'

const VAULT_VERSION = 1

const playbackSessionSchema: z.ZodType<PlaybackSession> = z
  .object({
    id: z.string(),
    source: z.enum(['local', 'explore']),
    title: z.string(),
    createdAt: z.number(),
    lastPlayedAt: z.number(),
    sizeBytes: z.number(),
    duration: z.number(),
    audioId: z.string().nullable(),
    subtitleId: z.string().nullable(),
    hasAudioBlob: z.boolean(),
    subtitleType: z.enum(['srt', 'vtt']).nullable(),
    progress: z.number(),
    audioFilename: z.string(),
    subtitleFilename: z.string(),
    audioUrl: z.string().optional(),
    localTrackId: z.string().optional(),
    artworkUrl: z.string().optional(),
    description: z.string().optional(),
    podcastTitle: z.string().optional(),
    podcastFeedUrl: z.string().optional(),
    publishedAt: z.number().optional(),
    episodeId: z.string().optional(),
  })
  .loose()

const subscriptionSchema: z.ZodType<Subscription> = z
  .object({
    id: z.string(),
    feedUrl: z.string(),
    title: z.string(),
    author: z.string(),
    artworkUrl: z.string(),
    addedAt: z.number(),
    providerPodcastId: z.string().optional(),
  })
  .loose()

const favoriteSchema: z.ZodType<Favorite> = z
  .object({
    id: z.string(),
    key: z.string(),
    feedUrl: z.string(),
    audioUrl: z.string(),
    episodeTitle: z.string(),
    podcastTitle: z.string(),
    artworkUrl: z.string(),
    addedAt: z.number(),
    description: z.string().optional(),
    pubDate: z.string().optional(),
    duration: z.number().optional(),
    episodeArtworkUrl: z.string().optional(),
    episodeId: z.string().optional(),
  })
  .loose()

const settingSchema: z.ZodType<Setting> = z
  .object({
    key: z.string(),
    value: z.string(),
    updatedAt: z.number(),
  })
  .loose()

const folderSchema: z.ZodType<FileFolder> = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.number(),
    pinnedAt: z.number().optional(),
  })
  .loose()

const localTrackSchema: z.ZodType<FileTrack> = z
  .object({
    id: z.string(),
    folderId: z.union([z.string(), z.null(), z.undefined()]),
    name: z.string(),
    audioId: z.string(),
    sizeBytes: z.number(),
    durationSeconds: z.number().optional(),
    createdAt: z.number(),
    activeSubtitleId: z.string().optional(),
    artworkId: z.string().optional(),
  })
  .loose()

const localSubtitleSchema: z.ZodType<FileSubtitle> = z
  .object({
    id: z.string(),
    trackId: z.string(),
    name: z.string(),
    subtitleId: z.string(),
  })
  .loose()

/**
 * Zod schema for the entire Personal Vault JSON structure.
 * This ensures data integrity during import.
 */
export const vaultSchema = z.object({
  version: z.literal(VAULT_VERSION),
  exportedAt: z.number(),
  data: z.object({
    folders: z.array(folderSchema),
    local_tracks: z.array(localTrackSchema),
    local_subtitles: z.array(localSubtitleSchema),
    subscriptions: z.array(subscriptionSchema),
    favorites: z.array(favoriteSchema),
    playback_sessions: z.array(playbackSessionSchema),
    settings: z.array(settingSchema),
  }),
})

export type VaultData = z.infer<typeof vaultSchema>

/**
 * Exports all metadata tables to a single JSON object.
 * Excludes blob content (audioBlobs, subtitles).
 */
export async function exportVault(): Promise<VaultData> {
  const data = {
    folders: await db.folders.toArray(),
    local_tracks: await db.local_tracks.toArray(),
    local_subtitles: await db.local_subtitles.toArray(),
    subscriptions: await db.subscriptions.toArray(),
    favorites: await db.favorites.toArray(),
    playback_sessions: await db.playback_sessions.toArray(),
    settings: await db.settings.toArray(),
  }

  return {
    version: VAULT_VERSION,
    exportedAt: Date.now(),
    data,
  }
}

/**
 * Imports a vault JSON object, overwriting existing metadata.
 * Uses a transaction to ensure atomicity.
 */
export async function importVault(json: unknown): Promise<void> {
  const result = vaultSchema.safeParse(json)

  if (!result.success) {
    logError('[Vault] Invalid vault format:', result.error)
    throw new Error('Invalid vault format')
  }

  const vault = result.data

  await db.transaction(
    'rw',
    [
      db.folders,
      db.local_tracks,
      db.local_subtitles,
      db.subscriptions,
      db.favorites,
      db.playback_sessions,
      db.settings,
    ],
    async () => {
      // 1. Clear existing metadata
      await db.folders.clear()
      await db.local_tracks.clear()
      await db.local_subtitles.clear()
      await db.subscriptions.clear()
      await db.favorites.clear()
      await db.playback_sessions.clear()
      await db.settings.clear()

      // 2. Ingest new data
      await db.folders.bulkAdd(vault.data.folders)
      const localTracks: FileTrack[] = vault.data.local_tracks.map((track) => ({
        id: track.id,
        folderId: track.folderId ?? null,
        name: track.name,
        audioId: track.audioId,
        sizeBytes: track.sizeBytes,
        durationSeconds: track.durationSeconds,
        createdAt: track.createdAt,
        activeSubtitleId: track.activeSubtitleId,
        artworkId: track.artworkId,
      }))
      await db.local_tracks.bulkAdd(localTracks)
      await db.local_subtitles.bulkAdd(vault.data.local_subtitles)
      await db.subscriptions.bulkAdd(vault.data.subscriptions)
      await db.favorites.bulkAdd(vault.data.favorites)
      await db.playback_sessions.bulkAdd(vault.data.playback_sessions)
      await db.settings.bulkAdd(vault.data.settings)

      log('[Vault] Import successful')
    }
  )
}
