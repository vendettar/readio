import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../dexieDb'
import { exportVault, importVault } from '../vault'

describe('Vault Sessions Regression (localTrackId: null)', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('successfully exports and imports explore sessions with localTrackId: null', async () => {
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
      countryAtSave: 'us',
    })

    const vaultData = await exportVault()

    const exportedSession = vaultData.data.playback_sessions.find((s) => s.id === sessionId)
    expect(exportedSession).toBeDefined()
    expect(exportedSession?.localTrackId).toBe(null)
    expect(exportedSession?.source).toBe('explore')
    expect(exportedSession?.countryAtSave).toBe('us')

    await DB.clearAllData()
    expect(await db.playback_sessions.count()).toBe(0)

    await importVault(vaultData)

    const restored = await db.playback_sessions.get(sessionId)
    expect(restored).toBeDefined()
    expect(restored?.localTrackId).toBe(null)
    expect(restored?.source).toBe('explore')
    expect(restored?.countryAtSave).toBe('us')
  })

  it('successfully exports and imports local sessions without countryAtSave', async () => {
    const sessionId = 'local-session-123'
    await db.playback_sessions.add({
      id: sessionId,
      source: 'local',
      title: 'Local History Title',
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      sizeBytes: 1024,
      durationSeconds: 120,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 0,
      audioFilename: 'local.mp3',
      subtitleFilename: 'local.vtt',
      localTrackId: null,
    })

    const vaultData = await exportVault()

    const exportedSession = vaultData.data.playback_sessions.find((s) => s.id === sessionId)
    expect(exportedSession).toBeDefined()
    expect(exportedSession?.source).toBe('local')
    expect(exportedSession?.localTrackId).toBe(null)
    expect(exportedSession?.countryAtSave).toBeUndefined()

    await DB.clearAllData()
    expect(await db.playback_sessions.count()).toBe(0)

    await importVault(vaultData)

    const restored = await db.playback_sessions.get(sessionId)
    expect(restored).toBeDefined()
    expect(restored?.source).toBe('local')
    expect(restored?.localTrackId).toBe(null)
    expect(restored?.countryAtSave).toBeUndefined()
  })
})
