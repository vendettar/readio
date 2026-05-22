import { z } from 'zod'
import { SUPPORTED_CONTENT_REGIONS } from '../constants/app'
import { buildFavoriteKey } from './db/favoriteIdentity'
import type {
  Favorite,
  FileFolder,
  FileSubtitle,
  FileTrack,
  PlaybackSession,
  PodcastDownload,
  Setting,
  Subscription,
} from './db/types'
import { TRACK_SOURCE } from './db/types'
import { verifyVaultIntegrity } from './integrity'
import { log, error as logError } from './logger'
import { VaultRepository } from './repositories/VaultRepository'

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
  showTitle: z.string().optional(),
  description: z.string().optional(),
  publishedAt: z.number().optional(),
  episodeGuid: z.string().optional(),
  podcastItunesId: z.string().optional(),
  transcriptUrl: z.string().optional(),
})

const localPlaybackSessionSchema = playbackSessionBaseSchema
  .extend({
    source: z.literal('local'),
    episodeGuid: z.undefined().optional(),
    podcastItunesId: z.undefined().optional(),
    countryAtSave: z.undefined().optional(),
  })
  .strict()

const explorePlaybackSessionSchema = playbackSessionBaseSchema
  .extend({
    source: z.literal('explore'),
    audioUrl: z.string(),
    artworkUrl: z.string(),
    showTitle: z.string(),
    episodeGuid: z.string(),
    podcastItunesId: z.string(),
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
    author: z.string(),
    artworkUrl: z.string(),
    addedAt: z.number(),
    podcastItunesId: z.string(),
    countryAtSave: z.preprocess(normalizeOptionalCountryAtSave, z.string()),
  })
  .strict()

const favoriteSchema: z.ZodType<Favorite> = z
  .object({
    id: z.string(),
    key: z.string(),
    audioUrl: z.string(),
    episodeTitle: z.string(),
    podcastTitle: z.string(),
    artworkUrl: z.string(),
    addedAt: z.number(),
    description: z.string(),
    pubDate: z.number().int().nonnegative(),
    durationSeconds: z.number(),
    episodeArtworkUrl: z.string(),
    episodeGuid: z.string(),
    podcastItunesId: z.string(),
    transcriptUrl: z.string().optional(),
    countryAtSave: z.preprocess(normalizeOptionalCountryAtSave, z.string()),
  })
  .refine(
    (favorite) => favorite.key === buildFavoriteKey(favorite.podcastItunesId, favorite.episodeGuid),
    {
      message: 'favorite.key must match canonical podcastItunesId::episodeGuid identity',
      path: ['key'],
    }
  )
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
    sourcePodcastTitle: z.string(),
    sourceEpisodeTitle: z.string(),
    sourceDescription: z.string(),
    sourceArtworkUrl: z.string(),
    downloadedAt: z.number(),
    countryAtSave: z.preprocess(normalizeOptionalCountryAtSave, z.string()),
    sourcePodcastItunesId: z.string(),
    sourceEpisodeGuid: z.string(),
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
export const vaultSchema = z
  .object({
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
  })
  .strict()

export type VaultData = z.infer<typeof vaultSchema>

/**
 * Exports all metadata tables to a single JSON object.
 * Excludes blob content (audioBlobs, subtitles).
 */
export async function exportVault(): Promise<VaultData> {
  const snapshot = await VaultRepository.getMetadataSnapshot()

  const data = {
    folders: snapshot.folders,
    tracks: snapshot.tracks,
    local_subtitles: snapshot.localSubtitles,
    subscriptions: snapshot.subscriptions,
    favorites: snapshot.favorites,
    playback_sessions: snapshot.playbackSessions,
    settings: snapshot.settings.filter((entry) => !isCredentialLikeSettingKey(entry.key)),
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

  await VaultRepository.replaceMetadata({
    folders: vault.data.folders,
    tracks: vault.data.tracks,
    localSubtitles: vault.data.local_subtitles,
    subscriptions: vault.data.subscriptions,
    favorites: vault.data.favorites,
    playbackSessions: vault.data.playback_sessions,
    settings: vault.data.settings.filter((entry) => !isCredentialLikeSettingKey(entry.key)),
  })

  log('[Vault] Import successful')
}
