import { beforeEach, describe, expect, it } from 'vitest'
import { ROOT_FOLDER_ID } from '../db/types'
import { DB, db } from '../dexieDb'

describe('DexieDB files query behavior', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('getFileTracksInFolder(null) returns root tracks sorted by createdAt DESC', async () => {
    // Create tracks in reverse order of createdAt
    await DB.addFileTrack({ name: 'Track 1', audioId: 'a1', sizeBytes: 100, folderId: null })
    await new Promise((r) => setTimeout(r, 10))
    await DB.addFileTrack({ name: 'Track 2', audioId: 'a2', sizeBytes: 200, folderId: null })

    const rootTracks = await DB.getFileTracksInFolder(null)
    expect(rootTracks).toHaveLength(2)
    expect(rootTracks[0].name).toBe('Track 2') // Sorted DESC by createdAt
    expect(rootTracks[1].name).toBe('Track 1')
  })

  it('getFileTracksCountInFolder(null) counts only root tracks', async () => {
    await DB.addFileTrack({ name: 'T1', audioId: 'a1', sizeBytes: 100, folderId: null })
    await DB.addFileTrack({ name: 'T2', audioId: 'a2', sizeBytes: 100, folderId: 'sub' })
    expect(await DB.getFileTracksCountInFolder(null)).toBe(1)
  })

  it('getFileTracksInFolder(undefined) is normalized to root folder', async () => {
    await DB.addFileTrack({ name: 'Root Track', audioId: 'a1', sizeBytes: 100, folderId: null })
    await DB.addFileTrack({ name: 'Sub Track', audioId: 'a2', sizeBytes: 200, folderId: 'sub' })

    const rootTracks = await DB.getFileTracksInFolder(undefined)
    expect(rootTracks).toHaveLength(1)
    expect(rootTracks[0].name).toBe('Root Track')
  })

  it('subfolder query still uses compound index path', async () => {
    await DB.addFileTrack({ name: 'Root Track', audioId: 'a1', sizeBytes: 100, folderId: null })
    await DB.addFileTrack({ name: 'Sub Track 1', audioId: 'a2', sizeBytes: 200, folderId: 'sub' })
    await new Promise((r) => setTimeout(r, 10))
    await DB.addFileTrack({ name: 'Sub Track 2', audioId: 'a3', sizeBytes: 300, folderId: 'sub' })

    const subTracks = await DB.getFileTracksInFolder('sub')
    expect(subTracks).toHaveLength(2)
    expect(subTracks[0].name).toBe('Sub Track 2')
    expect(subTracks[1].name).toBe('Sub Track 1')
  })

  it('root folder query does not rely on null compound key index', async () => {
    await DB.addFileTrack({ name: 'Root Track', audioId: 'a1', sizeBytes: 100, folderId: null })
    await DB.addFileTrack({ name: 'Sub Track', audioId: 'a2', sizeBytes: 100, folderId: 'sub' })

    const rootTracks = await DB.getFileTracksInFolder(null)
    expect(rootTracks).toHaveLength(1)
    expect(rootTracks[0].name).toBe('Root Track')
  })

  it('normalizes root folder to sentinel at write boundary and preserves null in public reads', async () => {
    const id = await DB.addFileTrack({
      name: 'Sentinel Root Track',
      audioId: 'a-root',
      sizeBytes: 100,
      folderId: null,
    })

    const rawTrack = await db.tracks.get(id)
    expect(rawTrack?.sourceType).toBe('user_upload')
    if (!rawTrack || rawTrack.sourceType !== 'user_upload') {
      throw new Error('Expected a user_upload track')
    }
    expect(rawTrack.folderId).toBe(ROOT_FOLDER_ID)

    const publicTrack = await DB.getFileTrack(id)
    expect(publicTrack?.folderId).toBeNull()
  })
})
