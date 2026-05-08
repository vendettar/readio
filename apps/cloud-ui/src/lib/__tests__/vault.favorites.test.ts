import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../dexieDb'
import { exportVault, importVault } from '../vault'

describe('Vault Favorites Regression', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('successfully exports and imports favorites without throwing schema errors', async () => {
    // 1. Setup a favorite
    await DB.addFavorite({
      key: 'pod-1::episode-guid-1',
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Test Episode',
      podcastTitle: 'Test Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      episodeArtworkUrl: 'https://example.com/ep-art.jpg',
      description: 'Test desc',
      pubDate: '2025-02-01',
      durationSeconds: 180,
      addedAt: Date.now(),
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
      countryAtSave: 'us',
    })

    // 2. Export the vault
    const vaultData = await exportVault()

    // Validate it exported correctly
    expect(vaultData.data.favorites).toHaveLength(1)
    expect(vaultData.data.favorites[0].episodeTitle).toBe('Test Episode')

    // 3. Clear data to simulate fresh install
    await DB.clearAllData()
    expect(await db.favorites.count()).toBe(0)

    // 4. Import the vault (this would throw if schema parse failed)
    await importVault(vaultData)

    // Validate data was restored
    const restoredFavorites = await DB.getAllFavorites()
    expect(restoredFavorites).toHaveLength(1)
    expect(restoredFavorites[0].episodeTitle).toBe('Test Episode')
    expect(restoredFavorites[0].audioUrl).toBe('https://example.com/audio.mp3')
  })

  it('normalizes canonical vault records before persisting them', async () => {
    const now = Date.now()
    await importVault({
      version: 1,
      exportedAt: now,
      data: {
        folders: [],
        tracks: [],
        local_subtitles: [],
        subscriptions: [
          {
            id: 'sub-1',
            podcastItunesId: ' pod-1 ',
            title: ' Podcast Title ',
            author: ' Podcast Author ',
            artworkUrl: ' https://example.com/art.jpg ',
            addedAt: now,
            countryAtSave: ' US ',
          },
        ],
        favorites: [
          {
            id: 'fav-1',
            key: 'pod-1::episode-guid-1',
            audioUrl: ' https://example.com/audio.mp3 ',
            episodeTitle: ' Episode Title ',
            podcastTitle: ' Podcast Title ',
            artworkUrl: ' https://example.com/episode-art.jpg ',
            episodeArtworkUrl: ' https://example.com/episode-art.jpg ',
            description: ' Episode description ',
            pubDate: ' 2025-02-01 ',
            durationSeconds: 180,
            addedAt: now,
            podcastItunesId: ' pod-1 ',
            episodeGuid: ' episode-guid-1 ',
            countryAtSave: ' US ',
          },
        ],
        playback_sessions: [
          {
            id: 'session-1',
            source: 'explore',
            title: 'Session Title',
            createdAt: now,
            lastPlayedAt: now,
            sizeBytes: 0,
            durationSeconds: 120,
            audioId: null,
            subtitleId: null,
            hasAudioBlob: false,
            progress: 0,
            audioFilename: '',
            subtitleFilename: '',
            audioUrl: ' https://example.com/audio.mp3 ',
            artworkUrl: ' https://example.com/episode-art.jpg ',
            description: 'Episode description',
            showTitle: ' Podcast Title ',
            publishedAt: now,
            episodeGuid: ' episode-guid-1 ',
            podcastItunesId: ' pod-1 ',
            transcriptUrl: 'https://example.com/transcript.json',
            countryAtSave: ' US ',
          },
        ],
        settings: [],
      },
    })

    const subscription = await db.subscriptions.get({ podcastItunesId: 'pod-1' })
    const favorite = await db.favorites.get({ key: 'pod-1::episode-guid-1' })
    const session = await db.playback_sessions.get('session-1')

    expect(subscription).toMatchObject({
      podcastItunesId: 'pod-1',
      title: 'Podcast Title',
      author: 'Podcast Author',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'us',
    })
    expect(favorite).toMatchObject({
      key: 'pod-1::episode-guid-1',
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode Title',
      podcastTitle: 'Podcast Title',
      artworkUrl: 'https://example.com/episode-art.jpg',
      episodeArtworkUrl: 'https://example.com/episode-art.jpg',
      description: 'Episode description',
      pubDate: '2025-02-01',
      durationSeconds: 180,
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
      countryAtSave: 'us',
    })
    expect(session).toMatchObject({
      source: 'explore',
      audioUrl: 'https://example.com/audio.mp3',
      artworkUrl: 'https://example.com/episode-art.jpg',
      showTitle: 'Podcast Title',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
      countryAtSave: 'us',
    })
  })
})
