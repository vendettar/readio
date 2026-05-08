import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DB } from '../../dexieDb'
import { MaintenanceRepository } from '../MaintenanceRepository'

describe('MaintenanceRepository', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('applies track repair patches and returns repaired ids', async () => {
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'track.mp3')
    const trackId = await DB.addFileTrack({
      name: 'Track',
      audioId,
      sizeBytes: 100,
      durationSeconds: 12,
      folderId: 'folder-1',
    })

    const repaired = await MaintenanceRepository.applyTrackRepairs([
      {
        trackId,
        patch: { isCorrupted: true, folderId: null },
      },
    ])

    expect(repaired).toEqual([trackId])
    const track = await DB.getFileTrack(trackId)
    expect(track).toMatchObject({
      id: trackId,
      isCorrupted: true,
      folderId: null,
    })
  })

  it('ignores empty batches', async () => {
    await expect(MaintenanceRepository.applyTrackRepairs([])).resolves.toEqual([])
  })
})
