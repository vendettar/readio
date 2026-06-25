import Dexie, { type EntityTable } from 'dexie'

import { getAppConfig } from '../runtimeConfig'

import type {
  AudioBlob,
  CredentialEntry,
  Favorite,
  FileFolder,
  FileSubtitle,
  PlaybackSession,
  RemoteTranscriptCache,
  RuntimeCacheEntry,
  Setting,
  Subscription,
  SubtitleText,
  Track,
} from './types'

const getDbName = () => getAppConfig().DB_NAME

export const DB_TABLE_NAMES = {
  PLAYBACK_SESSIONS: 'playback_sessions',
  AUDIO_BLOBS: 'audioBlobs',
  SUBTITLES: 'subtitles',
  REMOTE_TRANSCRIPTS: 'remote_transcripts',
  SUBSCRIPTIONS: 'subscriptions',
  FAVORITES: 'favorites',
  SETTINGS: 'settings',
  CREDENTIALS: 'credentials',
  RUNTIME_CACHE: 'runtime_cache',
  FOLDERS: 'folders',
  TRACKS: 'tracks',
  LOCAL_SUBTITLES: 'local_subtitles',
} as const

const TRACKS_SCHEMA =
  'id, name, folderId, createdAt, audioId, artworkId, sourceType, sourceUrlNormalized, sourceEpisodeGuid, sourcePodcastItunesId, &[sourceType+sourceUrlNormalized], [sourceType+sourcePodcastItunesId+sourceEpisodeGuid], [sourceType+createdAt], [sourceType+folderId], [sourceType+folderId+createdAt]'

function buildSchema(tracksSchema: string) {
  return {
    [DB_TABLE_NAMES.TRACKS]: tracksSchema,
    [DB_TABLE_NAMES.PLAYBACK_SESSIONS]:
      'id, title, lastPlayedAt, audioUrl, localTrackId, audioId, episodeGuid, podcastItunesId, [audioUrl+lastPlayedAt], [localTrackId+lastPlayedAt], [podcastItunesId+episodeGuid]',
    [DB_TABLE_NAMES.AUDIO_BLOBS]: 'id, storedAt',
    [DB_TABLE_NAMES.SUBTITLES]: 'id, storedAt, asrFingerprint',
    [DB_TABLE_NAMES.REMOTE_TRANSCRIPTS]: 'id, &url, fetchedAt, asrFingerprint',
    [DB_TABLE_NAMES.SUBSCRIPTIONS]: 'id, &podcastItunesId, addedAt',
    [DB_TABLE_NAMES.FAVORITES]: 'id, &key, addedAt, episodeGuid, podcastItunesId, audioUrl',
    [DB_TABLE_NAMES.SETTINGS]: 'key',
    [DB_TABLE_NAMES.CREDENTIALS]: 'key',
    [DB_TABLE_NAMES.RUNTIME_CACHE]: '&key, namespace',
    [DB_TABLE_NAMES.FOLDERS]: 'id, name, createdAt',
    [DB_TABLE_NAMES.LOCAL_SUBTITLES]: 'id, trackId, subtitleId',
  }
}

export class ReadioDB extends Dexie {
  playback_sessions!: EntityTable<PlaybackSession, 'id'>
  audioBlobs!: EntityTable<AudioBlob, 'id'>
  subtitles!: EntityTable<SubtitleText, 'id'>
  remote_transcripts!: EntityTable<RemoteTranscriptCache, 'id'>

  subscriptions!: EntityTable<Subscription, 'id'>
  favorites!: EntityTable<Favorite, 'id'>
  settings!: EntityTable<Setting, 'key'>
  credentials!: EntityTable<CredentialEntry, 'key'>
  runtime_cache!: EntityTable<RuntimeCacheEntry, 'key'>

  folders!: EntityTable<FileFolder, 'id'>
  tracks!: EntityTable<Track, 'id'>
  local_subtitles!: EntityTable<FileSubtitle, 'id'>

  constructor() {
    super(getDbName())

    this.version(1).stores(buildSchema(TRACKS_SCHEMA))
  }
}

export const db = new ReadioDB()
