import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../dexieDb'
import { prunePlaybackHistory } from '../retention'

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
        duration: 100,
        sizeBytes: 0,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        audioFilename: '',
        subtitleFilename: '',
        subtitleType: null,
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
        duration: 0,
        sizeBytes: 0,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        audioFilename: '',
        subtitleFilename: '',
        subtitleType: null,
      },
      {
        id: 'recent-session',
        title: 'Recent',
        source: 'explore' as const,
        lastPlayedAt: recentTime,
        createdAt: recentTime,
        progress: 0,
        duration: 0,
        sizeBytes: 0,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        audioFilename: '',
        subtitleFilename: '',
        subtitleType: null,
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
})
