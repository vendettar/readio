import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../../dexieDb'
import { VaultRepository } from '../VaultRepository'

describe('VaultRepository', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('captures metadata snapshot with valid subtitle rows only', async () => {
    const folderId = await DB.addFolder('Inbox')
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'track.mp3')
    const trackId = await DB.addFileTrack({
      folderId,
      name: 'Track',
      audioId,
      sizeBytes: 100,
      durationSeconds: 12,
    })
    const subtitleId = await DB.addSubtitle([{ start: 0, end: 1, text: 'hello' }], 'track.srt')
    await DB.addFileSubtitle({
      trackId,
      name: 'track.srt',
      subtitleId,
      createdAt: Date.now(),
    })
    await db.local_subtitles.add({
      id: 'dangling-subtitle',
      trackId: 'missing-track',
      name: 'dangling.srt',
      subtitleId,
      createdAt: Date.now(),
    })

    const snapshot = await VaultRepository.getMetadataSnapshot()

    expect(snapshot.folders).toHaveLength(1)
    expect(snapshot.tracks).toHaveLength(1)
    expect(snapshot.localSubtitles).toHaveLength(1)
    expect(snapshot.localSubtitles[0].trackId).toBe(trackId)
  })

  it('replaces vault metadata atomically', async () => {
    await DB.addFolder('Old Folder')
    const now = Date.now()

    await VaultRepository.replaceMetadata({
      folders: [{ id: 'folder-1', name: 'New Folder', createdAt: now }],
      tracks: [],
      localSubtitles: [],
      subscriptions: [],
      favorites: [],
      playbackSessions: [],
      settings: [{ key: 'explore_country', value: 'jp', updatedAt: now }],
    })

    expect(await db.folders.toArray()).toEqual([
      { id: 'folder-1', name: 'New Folder', createdAt: now },
    ])
    expect(await db.settings.toArray()).toEqual([
      { key: 'explore_country', value: 'jp', updatedAt: now },
    ])
  })
})
