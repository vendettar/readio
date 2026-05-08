import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DB } from '../../dexieDb'
import {
  PERSIST_PLAYBACK_PROGRESS_REASON,
  persistEndedPlaybackProgress,
  persistPlaybackProgressSnapshot,
} from '../session/playerProgressPersistenceService'

describe('player/session/playerProgressPersistenceService', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('persists playback progress and lastPlayedAt for actively playing sessions', async () => {
    await DB.createPlaybackSession({
      id: 'progress-session-1',
      source: 'local',
      title: 'Track',
      progress: 0,
      durationSeconds: 100,
      lastPlayedAt: 10,
    })

    const result = await persistPlaybackProgressSnapshot({
      sessionId: 'progress-session-1',
      progress: 42,
      durationSeconds: 120,
      isPlaying: true,
      now: 999,
    })

    expect(result).toEqual({
      ok: true,
      reason: PERSIST_PLAYBACK_PROGRESS_REASON.STORED,
    })

    const session = await DB.getPlaybackSession('progress-session-1')
    expect(session).toEqual(
      expect.objectContaining({
        progress: 42,
        durationSeconds: 120,
        lastPlayedAt: 999,
      })
    )
  })

  it('reports missing sessions instead of throwing for progress persistence', async () => {
    const result = await persistPlaybackProgressSnapshot({
      sessionId: 'missing-session',
      progress: 42,
      durationSeconds: 120,
      isPlaying: false,
      now: 999,
    })

    expect(result).toEqual({
      ok: false,
      reason: PERSIST_PLAYBACK_PROGRESS_REASON.SESSION_NOT_FOUND,
    })
  })

  it('resets ended playback progress to zero', async () => {
    await DB.createPlaybackSession({
      id: 'ended-session-1',
      source: 'local',
      title: 'Track',
      progress: 98,
      durationSeconds: 100,
    })

    const result = await persistEndedPlaybackProgress({
      sessionId: 'ended-session-1',
      durationSeconds: 100,
    })

    expect(result).toEqual({
      ok: true,
      reason: PERSIST_PLAYBACK_PROGRESS_REASON.STORED,
    })

    const session = await DB.getPlaybackSession('ended-session-1')
    expect(session).toEqual(
      expect.objectContaining({
        progress: 0,
        durationSeconds: 100,
      })
    )
  })
})
