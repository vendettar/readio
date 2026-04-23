import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../../dexieDb'
import { isPodcastDownloadTrack, isUserUploadTrack, TRACK_SOURCE } from '../types'

describe('Track Type Guards and Delete Protection', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  describe('Type Guards', () => {
    it('correctly identifies user_upload tracks', () => {
      const track: unknown = { sourceType: TRACK_SOURCE.USER_UPLOAD }
      expect(isUserUploadTrack(track)).toBe(true)
      expect(isPodcastDownloadTrack(track)).toBe(false)
    })

    it('correctly identifies podcast_download tracks', () => {
      const track: unknown = { sourceType: TRACK_SOURCE.PODCAST_DOWNLOAD }
      expect(isUserUploadTrack(track)).toBe(false)
      expect(isPodcastDownloadTrack(track)).toBe(true)
    })

    it('handles null/undefined gracefully', () => {
      expect(isUserUploadTrack(null)).toBe(false)
      expect(isUserUploadTrack(undefined)).toBe(false)
      expect(isPodcastDownloadTrack(null)).toBe(false)
      expect(isPodcastDownloadTrack(undefined)).toBe(false)
    })
  })

  describe('Fail-Closed Delete Protection', () => {
    it('deleteFileTrack blocks podcast_download deletion', async () => {
      const downloadId = await DB.addPodcastDownload({
        name: 'Download',
        audioId: 'a1',
        sourceUrlNormalized: 'url1',
        lastAccessedAt: Date.now(),
        downloadedAt: Date.now(),
        sizeBytes: 100,
        countryAtSave: 'US',
      })

      // Try to delete via deleteFileTrack
      await DB.deleteFileTrack(downloadId)

      // Should still exist
      const track = await db.tracks.get(downloadId)
      expect(track).toBeDefined()
      expect(track?.sourceType).toBe(TRACK_SOURCE.PODCAST_DOWNLOAD)
    })

    it('removePodcastDownloadWithCleanup blocks user_upload deletion', async () => {
      const uploadId = await DB.addFileTrack({
        name: 'Upload',
        audioId: 'a2',
        sizeBytes: 200,
        folderId: null,
      })

      // Try to delete via podcast-download cleanup path
      await DB.removePodcastDownloadWithCleanup(uploadId)

      // Should still exist
      const track = await db.tracks.get(uploadId)
      expect(track).toBeDefined()
      expect(track?.sourceType).toBe(TRACK_SOURCE.USER_UPLOAD)
    })

    it('removePodcastDownloadWithCleanup clears local session refs and removes unreferenced blob', async () => {
      const audioId = await DB.addAudioBlob(new Blob(['audio']), 'download.mp3')
      const downloadId = await DB.addPodcastDownload({
        name: 'Download',
        audioId,
        sourceUrlNormalized: 'https://example.com/audio.mp3',
        lastAccessedAt: Date.now(),
        downloadedAt: Date.now(),
        sizeBytes: 100,
        countryAtSave: 'US',
      })

      await DB.createPlaybackSession({
        id: 'session-local-download',
        source: 'local',
        title: 'Download',
        audioId,
        hasAudioBlob: true,
        localTrackId: downloadId,
      })

      await DB.removePodcastDownloadWithCleanup(downloadId)

      const session = await db.playback_sessions.get('session-local-download')
      expect(session?.localTrackId).toBeNull()
      expect(session?.audioId).toBeNull()
      expect(session?.hasAudioBlob).toBe(false)
      expect(await db.tracks.get(downloadId)).toBeUndefined()
      expect(await db.audioBlobs.get(audioId)).toBeUndefined()
    })

    it('removePodcastDownloadWithCleanup preserves blob when still referenced by explore session', async () => {
      const audioId = await DB.addAudioBlob(new Blob(['audio']), 'shared.mp3')
      const downloadId = await DB.addPodcastDownload({
        name: 'Download',
        audioId,
        sourceUrlNormalized: 'https://example.com/shared.mp3',
        lastAccessedAt: Date.now(),
        downloadedAt: Date.now(),
        sizeBytes: 100,
        countryAtSave: 'US',
      })

      await DB.createPlaybackSession({
        id: 'session-explore-shared',
        source: 'explore',
        title: 'Explore',
        audioId,
        hasAudioBlob: true,
        localTrackId: null,
      })

      await DB.removePodcastDownloadWithCleanup(downloadId)

      const session = await db.playback_sessions.get('session-explore-shared')
      expect(session?.audioId).toBe(audioId)
      expect(session?.hasAudioBlob).toBe(true)
      expect(await db.audioBlobs.get(audioId)).toBeDefined()
    })
  })
})
