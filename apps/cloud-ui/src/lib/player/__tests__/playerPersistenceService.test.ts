import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../../dexieDb'
import { checkDownloadCapacity } from '../../downloadCapacity'
import {
  persistManualPlaybackAudio,
  persistManualPlaybackSubtitles,
} from '../session/playerPersistenceService'

vi.mock('../../logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

vi.mock('../../downloadCapacity', () => ({
  checkDownloadCapacity: vi.fn(),
}))

describe('player/session/playerPersistenceService', () => {
  beforeEach(async () => {
    await DB.clearAllData()
    vi.clearAllMocks()
  })

  it('persists manual playback audio and patches the current session', async () => {
    vi.mocked(checkDownloadCapacity).mockResolvedValue({
      allowed: true,
      currentUsageBytes: 0,
      capBytes: 1024,
    })

    await DB.createPlaybackSession({
      id: 'session-audio-1',
      source: 'local',
      title: 'Before Upload',
      progress: 0,
    })

    const file = new File(['audio bytes'], 'manual.mp3', { type: 'audio/mpeg' })

    const result = await persistManualPlaybackAudio({
      file,
      getCurrentSessionId: () => 'session-audio-1',
    })

    expect(result).toEqual({
      ok: true,
      reason: 'stored',
      audioId: expect.any(String),
    })

    const session = await DB.getPlaybackSession('session-audio-1')
    expect(session).toEqual(
      expect.objectContaining({
        audioId: result.audioId,
        audioFilename: 'manual.mp3',
        hasAudioBlob: true,
        sizeBytes: file.size,
      })
    )
  })

  it('rejects manual playback audio when quota check blocks it', async () => {
    vi.mocked(checkDownloadCapacity).mockResolvedValue({
      allowed: false,
      reason: 'known_size_exceeds',
      currentUsageBytes: 900,
      capBytes: 1024,
    })

    const file = new File(['audio bytes'], 'manual.mp3', { type: 'audio/mpeg' })

    const result = await persistManualPlaybackAudio({
      file,
      getCurrentSessionId: () => 'session-audio-blocked',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'blocked_by_quota',
    })
    expect(await DB.getAllAudioBlobIds()).toEqual([])
  })

  it('persists manual playback subtitles and patches the current session', async () => {
    await DB.createPlaybackSession({
      id: 'session-subtitle-1',
      source: 'local',
      title: 'Track With Subtitle',
      progress: 0,
    })

    const result = await persistManualPlaybackSubtitles({
      filename: 'manual.vtt',
      subtitles: [{ start: 0, end: 1, text: 'hello world' }],
      getCurrentSessionId: () => 'session-subtitle-1',
    })

    expect(result).toEqual({
      ok: true,
      subtitleId: expect.any(String),
    })

    const session = await DB.getPlaybackSession('session-subtitle-1')
    expect(session).toEqual(
      expect.objectContaining({
        subtitleId: result.subtitleId,
        subtitleFilename: 'manual.vtt',
      })
    )
  })
})
