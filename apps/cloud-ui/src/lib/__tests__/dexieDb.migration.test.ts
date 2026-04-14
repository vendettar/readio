import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'

const TRACKS_SCHEMA_V6 =
  'id, name, folderId, createdAt, audioId, sourceType, sourceUrlNormalized, lastAccessedAt, &[sourceType+sourceUrlNormalized], [sourceType+createdAt], [sourceType+folderId], [sourceType+folderId+createdAt]'

function buildLegacySchema() {
  return {
    tracks: TRACKS_SCHEMA_V6,
    playback_sessions:
      'id, title, lastPlayedAt, source, createdAt, audioUrl, audioFilename, localTrackId, audioId, episodeId, providerEpisodeId, countryAtSave',
    audioBlobs: 'id, storedAt',
    subtitles: 'id, storedAt, asrFingerprint',
    remote_transcripts: 'id, &url, fetchedAt, asrFingerprint',
    subscriptions: 'id, &feedUrl, addedAt, podcastItunesId, countryAtSave',
    favorites: 'id, &key, addedAt, episodeId, providerEpisodeId, audioUrl, countryAtSave',
    settings: 'key',
    credentials: 'key',
    runtime_cache: '&key, namespace, at, [namespace+at]',
    folders: 'id, name, createdAt',
    local_subtitles: 'id, trackId, subtitleId, [trackId+createdAt], [trackId+status+createdAt]',
  }
}

describe('DexieDB migration to artworkId index', () => {
  afterEach(() => {
    vi.resetModules()
    window.__READIO_ENV__ = undefined
  })

  it('upgrades v6 DB to v7 and provides indexed artworkId lookup', async () => {
    const dbName = `readio-lite-migrate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    window.__READIO_ENV__ = { READIO_DB_NAME: dbName }

    const legacyDb = new Dexie(dbName)
    legacyDb.version(6).stores(buildLegacySchema())
    await legacyDb.open()
    await legacyDb.table('tracks').put({
      id: 'legacy-track',
      name: 'Legacy Track',
      folderId: null,
      createdAt: Date.now(),
      audioId: 'legacy-audio',
      artworkId: 'legacy-artwork',
      sourceType: 'user_upload',
      sourceUrlNormalized: '',
      lastAccessedAt: Date.now(),
      sizeBytes: 123,
    })
    await legacyDb.close()

    vi.resetModules()
    const { DB, db } = await import('../dexieDb')

    try {
      const hasArtworkIndex = db.tracks.schema.indexes.some((index) => index.name === 'artworkId')
      expect(hasArtworkIndex).toBe(true)

      const track = await DB.getFileTrack('legacy-track')
      expect(track?.name).toBe('Legacy Track')

      const byArtworkCount = await db.tracks.where('artworkId').equals('legacy-artwork').count()
      expect(byArtworkCount).toBe(1)
    } finally {
      await db.delete()
    }
  })
})
