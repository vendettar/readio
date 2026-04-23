import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type FileSubtitle, type PodcastDownload } from '../dexieDb'
import { prunePlaybackHistory, runIntegrityCheck } from '../retention'

// Mock logger to avoid console pollution
vi.mock('../logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

describe('Retention Policy', () => {
  beforeEach(async () => {
    await db.playback_sessions.clear()
  })

  it('should keep only the most recent 1000 sessions', async () => {
    // Seed 1100 sessions
    const sessions = []
    const now = Date.now()
    for (let i = 0; i < 1100; i++) {
      sessions.push({
        id: `session-${i}`,
        title: `Session ${i}`,
        source: 'explore' as const,
        lastPlayedAt: now - i * 1000, // session-0 is newest, session-1099 is oldest
        createdAt: now - i * 1000,
        progress: 10,
        durationSeconds: 100,
        sizeBytes: 0,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        audioFilename: '',
        subtitleFilename: '',
      })
    }

    // Use bulkPut for speed
    await db.playback_sessions.bulkPut(sessions)

    expect(await db.playback_sessions.count()).toBe(1100)

    await prunePlaybackHistory()

    expect(await db.playback_sessions.count()).toBe(1000)

    // Check that we kept the newest ones (IDs session-0 to session-999)
    const newest = await db.playback_sessions.orderBy('lastPlayedAt').reverse().first()
    expect(newest?.id).toBe('session-0')

    const oldest = await db.playback_sessions.orderBy('lastPlayedAt').first()
    expect(oldest?.id).toBe('session-999')

    // Verify session-1000 was deleted
    expect(await db.playback_sessions.get('session-1000')).toBeUndefined()
  })

  it('should prune sessions older than 6 months', async () => {
    const now = Date.now()
    const oldTime = now - 200 * 24 * 60 * 60 * 1000 // 200 days (> 180)
    const recentTime = now - 10 * 24 * 60 * 60 * 1000 // 10 days

    await db.playback_sessions.bulkPut([
      {
        id: 'old-session',
        title: 'Old',
        source: 'explore' as const,
        lastPlayedAt: oldTime,
        createdAt: oldTime,
        progress: 0,
        durationSeconds: 0,
        sizeBytes: 0,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        audioFilename: '',
        subtitleFilename: '',
      },
      {
        id: 'recent-session',
        title: 'Recent',
        source: 'explore' as const,
        lastPlayedAt: recentTime,
        createdAt: recentTime,
        progress: 0,
        durationSeconds: 0,
        sizeBytes: 0,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        audioFilename: '',
        subtitleFilename: '',
      },
    ])

    await prunePlaybackHistory()

    expect(await db.playback_sessions.count()).toBe(1)
    expect(await db.playback_sessions.get('recent-session')).toBeDefined()
    expect(await db.playback_sessions.get('old-session')).toBeUndefined()
  })

  it('should handle empty database gracefully', async () => {
    await expect(prunePlaybackHistory()).resolves.not.toThrow()
    expect(await db.playback_sessions.count()).toBe(0)
  })

  describe('runIntegrityCheck', () => {
    beforeEach(async () => {
      await db.tracks.clear()
      await db.tracks.clear()
      await db.local_subtitles.clear()
      await db.audioBlobs.clear()
    })

    it('should NOT delete subtitles that point to a valid podcast download', async () => {
      const downloadId = 'download-123'
      const subtitleId = 'sub-456'
      const fileSubId = 'file-sub-789'

      await db.tracks.add({
        id: downloadId,
        audioId: 'audio-1',
        name: 'Test Download',
        createdAt: Date.now(),
        isCorrupted: false,
        sizeBytes: 100,
        sourceUrlNormalized: 'http://test.com',
        downloadedAt: Date.now(),
      } as PodcastDownload)

      await db.audioBlobs.add({
        id: 'audio-1',
        blob: new Blob([]),
        size: 0,
        type: 'audio/mpeg',
        filename: 'test.mp3',
        storedAt: Date.now(),
      })

      await db.local_subtitles.add({
        id: fileSubId,
        trackId: downloadId,
        subtitleId: subtitleId,
        name: 'Subtitle Version 1',
        status: 'ready',
        createdAt: Date.now(),
      } as FileSubtitle)

      await runIntegrityCheck()

      expect(await db.local_subtitles.count()).toBe(1)
      expect(await db.local_subtitles.get(fileSubId)).toBeDefined()
    })

    it('SHOULD delete subtitles that point to non-existent tracks/downloads', async () => {
      await db.local_subtitles.add({
        id: 'dangling',
        trackId: 'non-existent',
        subtitleId: 'sub-1',
        name: 'Dangling',
      } as FileSubtitle)

      await runIntegrityCheck()

      expect(await db.local_subtitles.count()).toBe(0)
    })
  })
})
