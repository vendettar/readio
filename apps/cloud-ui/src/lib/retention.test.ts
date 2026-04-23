import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROOT_FOLDER_ID, TRACK_SOURCE } from './db/types'
import { db } from './dexieDb'
import { runIntegrityCheck } from './retention'

vi.mock('./logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

describe('runIntegrityCheck', () => {
  beforeEach(async () => {
    await db.tracks.clear()
    await db.audioBlobs.clear()
    await db.folders.clear()
    await db.local_subtitles.clear()
  })

  it('marks track as corrupted if audio blob is missing', async () => {
    // 1. Setup: Create a track pointing to non-existent blob
    const trackId = 'track-1'
    await db.tracks.add({
      id: trackId,
      name: 'Corrupted Track',
      audioId: 'missing-blob-id',
      sizeBytes: 1000,
      createdAt: Date.now(),
      folderId: null,
      sourceType: TRACK_SOURCE.USER_UPLOAD,
    } as import('./db/types').UserUploadTrack)

    // 2. Run integrity check
    const report = await runIntegrityCheck()

    // 3. Verify
    const track = await db.tracks.get(trackId)
    expect(track?.isCorrupted).toBe(true)
    expect(report.missingAudioBlob).toBe(1)
    expect(report.totalRepairs).toBe(1)
    expect(report.checkedAt).toBeTypeOf('number')
  })

  it('moves track to root if folder is missing', async () => {
    const trackId = 'track-2'
    await db.tracks.add({
      id: trackId,
      name: 'Orphaned Track',
      audioId: 'blob-1',
      sizeBytes: 1000,
      createdAt: Date.now(),
      folderId: 'missing-folder-id', // Dangling reference
      sourceType: TRACK_SOURCE.USER_UPLOAD,
    } as import('./db/types').UserUploadTrack)

    // Add the blob so it's not marked corrupted
    await db.audioBlobs.add({
      id: 'blob-1',
      blob: new Blob([]),
      size: 0,
      type: 'audio/mpeg',
      filename: 'test.mp3',
      storedAt: Date.now(),
    })

    const report = await runIntegrityCheck()

    const track = await db.tracks.get(trackId)
    expect((track as import('./db/types').UserUploadTrack)?.folderId).toBe(ROOT_FOLDER_ID)
    expect(track?.isCorrupted).toBeFalsy()
    expect(report.danglingFolderRef).toBe(1)
    expect(report.totalRepairs).toBe(1)
  })

  it('repairs all planned issues across batch boundaries without misses', async () => {
    const total = 205
    for (let i = 0; i < total; i++) {
      await db.tracks.add({
        id: `track-batch-${i}`,
        name: `Batch Track ${i}`,
        audioId: `missing-blob-${i}`,
        sizeBytes: 1000,
        createdAt: Date.now(),
        folderId: `missing-folder-${i}`,
        sourceType: TRACK_SOURCE.USER_UPLOAD,
      } as import('./db/types').UserUploadTrack)
    }

    const report = await runIntegrityCheck()

    expect(report.missingAudioBlob).toBe(total)
    expect(report.danglingFolderRef).toBe(total)
    expect(report.totalRepairs).toBe(total * 2)

    const repairedTracks = await db.tracks.toArray()
    expect(repairedTracks).toHaveLength(total)
    for (const track of repairedTracks) {
      expect(track.isCorrupted).toBe(true)
      expect((track as import('./db/types').UserUploadTrack).folderId).toBe(ROOT_FOLDER_ID)
    }
  })

  it('deletes subtitle if track is missing', async () => {
    const subId = 'sub-1'
    await db.local_subtitles.add({
      id: subId,
      trackId: 'missing-track-id',
      name: 'Orphaned Sub',
      subtitleId: 'content-1',
      createdAt: Date.now(),
    })

    const report = await runIntegrityCheck()

    const sub = await db.local_subtitles.get(subId)
    expect(sub).toBeUndefined()
    expect(report.danglingTrackRef).toBe(1)
    expect(report.totalRepairs).toBe(1)
  })

  it('returns a zeroed report when no repairs are needed', async () => {
    const report = await runIntegrityCheck()

    expect(report.missingAudioBlob).toBe(0)
    expect(report.danglingFolderRef).toBe(0)
    expect(report.danglingTrackRef).toBe(0)
    expect(report.totalRepairs).toBe(0)
    expect(report.checkedAt).toBeTypeOf('number')
  })

  it('rethrows when integrity transaction fails', async () => {
    await db.tracks.add({
      id: 'track-fail',
      name: 'Fail Track',
      audioId: 'missing-blob-fail',
      sizeBytes: 1,
      createdAt: Date.now(),
      folderId: null,
      sourceType: TRACK_SOURCE.USER_UPLOAD,
    } as import('./db/types').UserUploadTrack)

    const transactionSpy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('db-fail'))
    await expect(runIntegrityCheck()).rejects.toThrow('db-fail')
    transactionSpy.mockRestore()
  })
})
