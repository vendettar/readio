import { z } from 'zod'
import { SUPPORTED_CONTENT_REGIONS } from '../constants/app'
import { TRACK_SOURCE } from './db/types'
import type {
  Favorite,
  FileFolder,
  FileSubtitle,
  FileTrack,
  PlaybackSession,
  PodcastDownload,
  Setting,
  Subscription,
} from './dexieDb'
import { db } from './dexieDb'
import { verifyVaultIntegrity } from './integrity'
import { log, error as logError } from './logger'

const VAULT_VERSION = 1
const CREDENTIAL_EXPORT_KEY_PATTERN = /^provider_[a-z0-9_]+_key$/
const CREDENTIAL_SETTING_KEYS = new Set(['asrKey', 'translateKey'])
const SUPPORTED_COUNTRY_SET = new Set<string>(SUPPORTED_CONTENT_REGIONS)

function isCredentialLikeSettingKey(key: string): boolean {
  if (!key) return false
  if (CREDENTIAL_EXPORT_KEY_PATTERN.test(key)) return true
  return CREDENTIAL_SETTING_KEYS.has(key)
}

function normalizeOptionalCountryAtSave(countryAtSave: unknown): string | undefined {
  if (typeof countryAtSave !== 'string') return undefined
  const normalized = countryAtSave.trim().toLowerCase()
  if (!normalized) return undefined
  return SUPPORTED_COUNTRY_SET.has(normalized) ? normalized : undefined
}

const playbackSessionBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  lastPlayedAt: z.number(),
  sizeBytes: z.number(),
  durationSeconds: z.number(),
  audioId: z.string().nullable(),
  subtitleId: z.string().nullable(),
  hasAudioBlob: z.boolean(),
  progress: z.number(),
  audioFilename: z.string(),
  subtitleFilename: z.string(),
  audioUrl: z.string().optional(),
  localTrackId: z.string().nullable().optional(),
  artworkUrl: z.string().optional(),
  description: z.string().optional(),
  podcastTitle: z.string().optional(),
  podcastFeedUrl: z.string().optional(),
  publishedAt: z.number().optional(),
  episodeGuid: z.string().optional(),
  podcastItunesId: z.string().optional(),
  transcriptUrl: z.string().optional(),
})

const localPlaybackSessionSchema = playbackSessionBaseSchema
  .extend({
    source: z.literal('local'),
    countryAtSave: z.undefined().optional(),
  })
  .strict()

const explorePlaybackSessionSchema = playbackSessionBaseSchema
  .extend({
    source: z.literal('explore'),
    countryAtSave: z.preprocess(normalizeOptionalCountryAtSave, z.string()),
  })
  .strict()

const playbackSessionSchema: z.ZodType<PlaybackSession> = z.discriminatedUnion('source', [
  localPlaybackSessionSchema,
  explorePlaybackSessionSchema,
])

const subscriptionSchema: z.ZodType<Subscription> = z
  .object({
    id: z.string(),
    title: z.string(),
    feedUrl: z.string(),
    author: z.string(),
    artworkUrl: z.string(),
    addedAt: z.number(),
    podcastItunesId: z.string().optional(),
    countryAtSave: z.preprocess(normalizeOptionalCountryAtSave, z.string()),
  })
  .strict()

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
    durationSeconds: z.number().optional(),
    episodeArtworkUrl: z.string().optional(),
    episodeGuid: z.string().optional(),
    podcastItunesId: z.string().optional(),
    transcriptUrl: z.string().optional(),
    countryAtSave: z.preprocess(normalizeOptionalCountryAtSave, z.string()),
  })
  .strict()

const settingSchema: z.ZodType<Setting> = z
  .object({
    key: z.string(),
    value: z.string(),
    updatedAt: z.number(),
  })
  .strict()

const folderSchema: z.ZodType<FileFolder> = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.number(),
    pinnedAt: z.number().optional(),
  })
  .strict()

const localTrackSchema: z.ZodType<FileTrack> = z
  .object({
    id: z.string(),
    folderId: z.union([z.string(), z.null()]),
    name: z.string(),
    audioId: z.string(),
    sizeBytes: z.number(),
    durationSeconds: z.number().optional(),
    createdAt: z.number(),
    activeSubtitleId: z.string().optional(),
    artworkId: z.string().optional(),
    sourceType: z.literal(TRACK_SOURCE.USER_UPLOAD),
    album: z.string().optional(),
    artist: z.string().optional(),
    isCorrupted: z.boolean().optional(),
  })
  .strict()

const podcastDownloadSchema: z.ZodType<PodcastDownload> = z
  .object({
    id: z.string(),
    name: z.string(),
    audioId: z.string(),
    sizeBytes: z.number(),
    durationSeconds: z.number().optional(),
    createdAt: z.number(),
    artworkId: z.string().optional(),
    sourceUrlNormalized: z.string(),
    sourceFeedUrl: z.string().optional(),
    sourcePodcastTitle: z.string().optional(),
    sourceEpisodeTitle: z.string().optional(),
    sourceDescription: z.string().optional(),
    sourceArtworkUrl: z.string().optional(),
    downloadedAt: z.number(),
    countryAtSave: z.preprocess(normalizeOptionalCountryAtSave, z.string()),
    sourcePodcastItunesId: z.string().optional(),
    sourceEpisodeGuid: z.string().optional(),
    transcriptUrl: z.string().optional(),
    isCorrupted: z.boolean().optional(),
    sourceType: z.literal(TRACK_SOURCE.PODCAST_DOWNLOAD),
    activeSubtitleId: z.string().optional(),
    manualPinnedAt: z.number().optional(),
  })
  .strict()

const localSubtitleSchema: z.ZodType<FileSubtitle> = z
  .object({
    id: z.string(),
    trackId: z.string(),
    name: z.string(),
    subtitleId: z.string(),
    createdAt: z.number(),
    sourceKind: z.enum(['manual_upload', 'asr_online', 'asr_background', 'built_in']).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    language: z.string().optional(),
    status: z.enum(['ready', 'failed']).optional(),
  })
  .strict()

/**
 * Zod schema for the entire Personal Vault JSON structure.
 * This ensures data integrity during import.
 */
export const vaultSchema = z.object({
  version: z.literal(VAULT_VERSION),
  exportedAt: z.number(),
  data: z
    .object({
      folders: z.array(folderSchema),
      tracks: z.array(z.union([localTrackSchema, podcastDownloadSchema])),
      local_subtitles: z.array(localSubtitleSchema),
      subscriptions: z.array(subscriptionSchema),
      favorites: z.array(favoriteSchema),
      playback_sessions: z.array(playbackSessionSchema),
      settings: z.array(settingSchema),
    })
    .strict(),
}).strict()

export type VaultData = z.infer<typeof vaultSchema>

/**
 * Exports all metadata tables to a single JSON object.
 * Excludes blob content (audioBlobs, subtitles).
 */
export async function exportVault(): Promise<VaultData> {
  const settings = await db.settings.toArray()

  const allTracks = await db.tracks.toArray()
  const trackIds = new Set(allTracks.map((t) => t.id))
  const allSubtitles = await db.local_subtitles.toArray()

  const data = {
    folders: await db.folders.toArray(),
    tracks: allTracks,
    local_subtitles: allSubtitles.filter((sub) => trackIds.has(sub.trackId)),
    subscriptions: await db.subscriptions.toArray(),
    favorites: await db.favorites.toArray(),
    playback_sessions: await db.playback_sessions.toArray(),
    settings: settings.filter((entry) => !isCredentialLikeSettingKey(entry.key)),
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

  // Perform business-level integrity check
  const integrity = verifyVaultIntegrity(vault)
  if (!integrity.isValid) {
    logError('[Vault] Integrity check failed:', integrity.error)
    throw new Error(integrity.error || 'Data integrity check failed')
  }

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
      // 1. Clear existing metadata
      await db.folders.clear()
      await db.tracks.clear()
      await db.local_subtitles.clear()
      await db.subscriptions.clear()
      await db.favorites.clear()
      await db.playback_sessions.clear()
      await db.settings.clear()

      // 2. Ingest new data
      await db.folders.bulkAdd(vault.data.folders)
      const tracks = vault.data.tracks || []
      await db.tracks.bulkAdd(tracks)

      await db.local_subtitles.bulkAdd(vault.data.local_subtitles)
      await db.subscriptions.bulkAdd(vault.data.subscriptions)
      await db.favorites.bulkAdd(vault.data.favorites)
      await db.playback_sessions.bulkAdd(vault.data.playback_sessions)
      await db.settings.bulkAdd(
        vault.data.settings.filter((entry) => !isCredentialLikeSettingKey(entry.key))
      )

      log('[Vault] Import successful')
    }
  )
}
