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
      key: 'https://example.com/feed.xml|https://example.com/audio.mp3',
      feedUrl: 'https://example.com/feed.xml',
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Test Episode',
      podcastTitle: 'Test Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      addedAt: Date.now(),
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
})
