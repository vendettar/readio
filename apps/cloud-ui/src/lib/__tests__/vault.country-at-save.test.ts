import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_COUNTRY } from '../../constants/app'
import { TRACK_SOURCE } from '../db/types'
import { DB, db } from '../dexieDb'
import { exportVault, importVault } from '../vault'

describe('vault countryAtSave normalization', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('migrates missing podcast download countryAtSave to default country during import', async () => {
    const trackId = await DB.addPodcastDownload({
      name: 'legacy-episode',
      audioId: 'audio-legacy',
      sizeBytes: 1234,
      sourceUrlNormalized: 'https://example.com/audio.mp3',
      lastAccessedAt: Date.now(),
      downloadedAt: Date.now(),
      countryAtSave: 'jp',
    })

    const vault = await exportVault()
    const legacyVault = {
      ...vault,
      data: {
        ...vault.data,
        tracks: vault.data.tracks.map((track) => {
          if (track.id !== trackId || track.sourceType !== TRACK_SOURCE.PODCAST_DOWNLOAD) {
            return track
          }
          const { countryAtSave: _dropped, ...legacyTrack } = track
          return legacyTrack
        }),
      },
    }

    await DB.clearAllData()
    await importVault(legacyVault)

    const restoredTrack = await db.tracks.get(trackId)
    if (!restoredTrack || restoredTrack.sourceType !== TRACK_SOURCE.PODCAST_DOWNLOAD) {
      throw new Error('Expected podcast download track')
    }
    expect(restoredTrack.countryAtSave).toBe(DEFAULT_COUNTRY)
    expect(restoredTrack.countryAtSave).not.toBe('')
  })
})
