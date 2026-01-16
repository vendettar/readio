import { beforeEach, describe, expect, it } from 'vitest'
import { DB } from '../dexieDb'

describe('Dexie database operations', () => {
  beforeEach(async () => {
    // Ensure a clean state between tests.
    // This project does not require DB migration compatibility; we can safely reset data.
    await DB.clearAllData()
  })

  it('can create and retrieve playback sessions', async () => {
    await DB.createPlaybackSession({
      id: 'test_session_1',
      progress: 12,
      duration: 345,
      audioFilename: 'test.mp3',
    })

    const session = await DB.getPlaybackSession('test_session_1')
    expect(session).toBeDefined()
    expect(session?.id).toBe('test_session_1')
    expect(session?.progress).toBe(12)
    expect(session?.duration).toBe(345)
    expect(session?.audioFilename).toBe('test.mp3')
  })

  it('can update existing playback sessions', async () => {
    await DB.createPlaybackSession({ id: 'test_session_2', progress: 0 })
    await DB.updatePlaybackSession('test_session_2', { progress: 100 })

    const session = await DB.getPlaybackSession('test_session_2')
    expect(session?.progress).toBe(100)
  })

  it('can store and retrieve settings', async () => {
    await DB.setSetting('country', 'us')
    const value = await DB.getSetting('country')
    expect(value).toBe('us')
  })

  it('returns null for non-existent settings', async () => {
    const value = await DB.getSetting('non_existent_key')
    expect(value).toBeNull()
  })

  it('can get last playback session ordered by lastPlayedAt', async () => {
    const oldId = `last_test_old_${Date.now()}`
    const newId = `last_test_new_${Date.now()}`

    await DB.createPlaybackSession({ id: oldId, lastPlayedAt: 1000 })
    // Use a slight delay to ensure different timestamps if needed,
    // but here we explicitly set it.
    await DB.createPlaybackSession({ id: newId, lastPlayedAt: Date.now() + 1000000 })

    const lastSession = await DB.getLastPlaybackSession()
    expect(lastSession?.id).toBe(newId)
  })
})
