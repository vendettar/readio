import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../dexieDb'
import { exportVault, importVault } from '../vault'

describe('Vault Sessions Regression (localTrackId: null)', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('successfully exports and imports sessions with localTrackId: null', async () => {
    // 1. Manually add a session with localTrackId: null
    // This happens when a download is deleted but the history session remains.
    const sessionId = 'session-123'
    await db.playback_sessions.add({
      id: sessionId,
      source: 'explore',
      title: 'History Title',
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      sizeBytes: 1024,
      durationSeconds: 120,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 0,
      audioFilename: 'file.mp3',
      subtitleFilename: 'sub.vtt',
      audioUrl: 'https://example.com/audio.mp3',
      localTrackId: null, // Critical: regression target
    })

    // 2. Export the vault
    const vaultData = await exportVault()

    // Validate it's in the export
    const exportedSession = vaultData.data.playback_sessions.find((s) => s.id === sessionId)
    expect(exportedSession).toBeDefined()
    expect(exportedSession?.localTrackId).toBe(null)

    // 3. Clear data
    await DB.clearAllData()
    expect(await db.playback_sessions.count()).toBe(0)

    // 4. Import the vault (this would throw Zod schema error if localTrackId: null wasn't allowed)
    await importVault(vaultData)

    // Validate data was restored
    const restored = await db.playback_sessions.get(sessionId)
    expect(restored).toBeDefined()
    expect(restored?.localTrackId).toBe(null)
  })
})
