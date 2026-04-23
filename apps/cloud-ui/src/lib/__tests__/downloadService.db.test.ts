import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../dexieDb'
import { removeDownloadedTrack } from '../downloadService'

describe('downloadService DB integration', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('cascades deletion of local_subtitles and subtitles when downloaded track is removed', async () => {
    // 1. Create a dummy podcast download
    const trackId = await DB.addPodcastDownload({
      name: 'Test Download',
      audioId: 'dummy-audio-id',
      sourceUrlNormalized: 'https://example.com/test.mp3',
      downloadedAt: Date.now(),
      sizeBytes: 1024,
      countryAtSave: 'US',
    })

    // 2. Create a dummy subtitle
    const subtitleId = await DB.addSubtitle([{ start: 0, end: 1, text: 'Hello' }], 'test.srt')

    // 3. Link them via local_subtitles
    await db.local_subtitles.add({
      id: 'sub-link-1',
      trackId,
      subtitleId,
      name: 'English.srt',
      createdAt: Date.now(),
    })

    // Verify setup
    expect(await db.tracks.get(trackId)).toBeDefined()
    expect(await db.subtitles.get(subtitleId)).toBeDefined()
    expect(await db.local_subtitles.get('sub-link-1')).toBeDefined()

    // 4. Remove track
    const result = await removeDownloadedTrack(trackId)
    expect(result).toBe(true)

    // 5. Verify cascade
    expect(await db.tracks.get(trackId)).toBeUndefined()
    expect(await db.local_subtitles.get('sub-link-1')).toBeUndefined()
    expect(await db.subtitles.get(subtitleId)).toBeUndefined()
  })

  it('does NOT delete subtitles if they are still referenced by another track', async () => {
    // 1. Create TWO podcast downloads
    const trackId1 = await DB.addPodcastDownload({
      name: 'Test Download 1',
      audioId: 'dummy-1',
      sourceUrlNormalized: 'https://example.com/1.mp3',
      downloadedAt: Date.now(),
      sizeBytes: 1024,
      countryAtSave: 'US',
    })
    const trackId2 = await DB.addPodcastDownload({
      name: 'Test Download 2',
      audioId: 'dummy-2',
      sourceUrlNormalized: 'https://example.com/2.mp3',
      downloadedAt: Date.now(),
      sizeBytes: 1024,
      countryAtSave: 'US',
    })

    // 2. Create ONE shared subtitle
    const subtitleId = await DB.addSubtitle([{ start: 0, end: 1, text: 'Shared' }], 'shared.srt')

    // 3. Link BOTH to the SAME subtitle
    await db.local_subtitles.add({
      id: 'link-1',
      trackId: trackId1,
      subtitleId,
      name: 'sub.srt',
      createdAt: Date.now(),
    })
    await db.local_subtitles.add({
      id: 'link-2',
      trackId: trackId2,
      subtitleId,
      name: 'sub.srt',
      createdAt: Date.now(),
    })

    // 4. Remove track 1
    await removeDownloadedTrack(trackId1)

    // 5. Verify track 1 is gone, link 1 is gone, BUT subtitle and link 2 remain
    expect(await db.tracks.get(trackId1)).toBeUndefined()
    expect(await db.local_subtitles.get('link-1')).toBeUndefined()
    expect(await db.subtitles.get(subtitleId)).toBeDefined()
    expect(await db.local_subtitles.get('link-2')).toBeDefined()

    // 6. Remove track 2
    await removeDownloadedTrack(trackId2)
    expect(await db.subtitles.get(subtitleId)).toBeUndefined()
  })

  it('cascades deletion of subtitle versions with metadata (Instruction 125b)', async () => {
    const trackId = await DB.addPodcastDownload({
      name: 'Versioned Episode',
      audioId: 'audio-v',
      sourceUrlNormalized: 'https://example.com/versioned.mp3',
      downloadedAt: Date.now(),
      sizeBytes: 1024,
      countryAtSave: 'US',
    })

    const sub1 = await DB.addSubtitle([{ start: 0, end: 1, text: 'content 1' }], 'v1.srt')
    const sub2 = await DB.addSubtitle([{ start: 1, end: 2, text: 'content 2' }], 'v2.srt')

    await db.local_subtitles.add({
      id: 'v-link-1',
      trackId,
      subtitleId: sub1,
      name: 'ASR v1',
      sourceKind: 'asr_online',
      provider: 'groq',
      model: 'whisper',
      createdAt: Date.now(),
      status: 'ready',
    })
    await db.local_subtitles.add({
      id: 'v-link-2',
      trackId,
      subtitleId: sub2,
      name: 'ASR v2',
      sourceKind: 'asr_online',
      provider: 'groq',
      model: 'whisper-large',
      createdAt: Date.now() + 1000,
      status: 'ready',
    })

    // Set active
    await db.tracks.update(trackId, { activeSubtitleId: 'v-link-2' })

    // Verify setup
    expect(await db.local_subtitles.where('trackId').equals(trackId).count()).toBe(2)

    // Remove track — should cascade all versions
    await removeDownloadedTrack(trackId)

    expect(await db.tracks.get(trackId)).toBeUndefined()
    expect(await db.local_subtitles.get('v-link-1')).toBeUndefined()
    expect(await db.local_subtitles.get('v-link-2')).toBeUndefined()
    expect(await db.subtitles.get(sub2)).toBeUndefined()
  })

  it('clearAllDownloads handles multiple tracks correctly (sequential)', async () => {
    // 1. Create 12 tracks (should trigger 3 batches of 5, 5, 2)
    const trackIds: string[] = []
    for (let i = 0; i < 12; i++) {
      const id = await DB.addPodcastDownload({
        name: `Ep ${i}`,
        audioId: `audio-${i}`,
        sourceUrlNormalized: `https://example.com/${i}.mp3`,
        downloadedAt: Date.now(),
        sizeBytes: 100,
        countryAtSave: 'US',
      })
      trackIds.push(id)
    }

    expect(await db.tracks.count()).toBe(12)

    // 2. Perform bulk clear
    const { clearAllDownloads } = await import('../downloadService')
    const count = await clearAllDownloads()

    expect(count).toBe(12)
    expect(await db.tracks.count()).toBe(0)
  })

  it('clearAllDownloads correctly cleans up shared resources without leaks or race conditions', async () => {
    // 1. Create a shared audio blob and shared subtitle
    const sharedAudioId = await DB.addAudioBlob(new Blob(['shared-audio']), 'shared.mp3')
    const sharedSubtitleContentId = await DB.addSubtitle(
      [{ start: 0, end: 1, text: 'shared' }],
      'shared.srt'
    )

    // 2. Create 3 tracks sharing THESE SAME resources
    const tracks = []
    for (let i = 0; i < 3; i++) {
      const trackId = await DB.addPodcastDownload({
        name: `Shared ${i}`,
        audioId: sharedAudioId,
        sourceUrlNormalized: `https://example.com/shared-${i}.mp3`,
        downloadedAt: Date.now(),
        sizeBytes: 100,
        countryAtSave: 'US',
      })
      await db.local_subtitles.add({
        id: `link-${i}`,
        trackId,
        subtitleId: sharedSubtitleContentId,
        name: 'Shared.srt',
        status: 'ready',
        createdAt: Date.now(),
      })
      tracks.push(trackId)
    }

    // Verify initial state
    expect(await db.tracks.count()).toBe(3)
    expect(await db.audioBlobs.get(sharedAudioId)).toBeDefined()
    expect(await db.subtitles.get(sharedSubtitleContentId)).toBeDefined()
    expect(await db.local_subtitles.count()).toBe(3)

    // 3. Clear all downloads
    const { clearAllDownloads } = await import('../downloadService')
    const removedCount = await clearAllDownloads()

    // 4. Assertions
    expect(removedCount).toBe(3)
    expect(await db.tracks.count()).toBe(0)
    expect(await db.local_subtitles.count()).toBe(0)

    // Resources should be deleted ONLY after the LAST track using them is removed
    expect(await db.audioBlobs.get(sharedAudioId)).toBeUndefined()
    expect(await db.subtitles.get(sharedSubtitleContentId)).toBeUndefined()
  })

  describe('Folder Invariants (Instruction 20260228-R7)', () => {
    it('normalize folderId to null on creation', async () => {
      const id = await DB.addFileTrack({
        name: 'Undefined Root',
        audioId: 'audio-1',
        sizeBytes: 100,
        folderId: undefined as unknown as string,
      })

      const track = await DB.getFileTrack(id)
      expect(track?.folderId).toBe(null) // Should be normalized to null
    })

    it('getFileTracksInFolder(null) matches only normalized rows', async () => {
      // 1. Create one track through DB API (normalized)
      await DB.addFileTrack({
        name: 'Proper Null',
        audioId: 'audio-3',
        sizeBytes: 300,
        folderId: null,
      })

      // 2. Create another track with undefined (normalized to null)
      await new Promise((r) => setTimeout(r, 10))
      await DB.addFileTrack({
        name: 'Normalized Null',
        audioId: 'audio-4',
        sizeBytes: 400,
        folderId: undefined as unknown as string,
      })

      // 3. Query root folder
      const rootTracks = await DB.getFileTracksInFolder(null)
      const count = await DB.getFileTracksCountInFolder(null)

      expect(rootTracks.length).toBe(2)
      expect(count).toBe(2)
      expect(rootTracks.every((t) => t.folderId === null)).toBe(true)
    })

    it('normalize folderId to null on update', async () => {
      const id = await DB.addFileTrack({
        name: 'Update Target',
        audioId: 'audio-4',
        sizeBytes: 400,
        folderId: 'some-folder',
      })

      await DB.updateFileTrack(id, { folderId: undefined as unknown as string })

      const updated = await DB.getFileTrack(id)
      expect(updated?.folderId).toBe(null)
    })
  })
})
