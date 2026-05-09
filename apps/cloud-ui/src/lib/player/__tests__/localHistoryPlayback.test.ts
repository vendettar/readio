import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreLocalHistoryPlayback } from '../localHistoryPlayback'

const loadSessionSubtitleCuesMock = vi.fn()
const logErrorMock = vi.fn()
let playbackEpoch = 0

vi.mock('../session/playerSessionSubtitleLoader', () => ({
  loadSessionSubtitleCues: (...args: unknown[]) => loadSessionSubtitleCuesMock(...args),
}))

vi.mock('../../logger', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

vi.mock('../remotePlayback', () => ({
  bumpPlaybackEpoch: () => ++playbackEpoch,
  getPlaybackEpoch: () => playbackEpoch,
}))

describe('restoreLocalHistoryPlayback', () => {
  beforeEach(() => {
    playbackEpoch = 0
    loadSessionSubtitleCuesMock.mockReset().mockResolvedValue(null)
    logErrorMock.mockReset()
  })

  it('starts local history playback through the shared restore flow', async () => {
    const audioBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    const loadAudioBlob = vi.fn().mockResolvedValue(undefined)
    const setSubtitles = vi.fn()
    const setPlaybackTrackId = vi.fn()
    const applyStartedSurface = vi.fn()
    const play = vi.fn()

    loadSessionSubtitleCuesMock.mockResolvedValue([{ start: 0, end: 1, text: 'cue' }])

    const result = await restoreLocalHistoryPlayback(
      {
        id: 'session-local-1',
        source: 'local',
        title: 'Local Session',
        createdAt: 1,
        lastPlayedAt: 1,
        sizeBytes: 0,
        durationSeconds: 30,
        audioId: 'audio-1',
        subtitleId: 'subtitle-1',
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'local.mp3',
        subtitleFilename: 'local.srt',
        localTrackId: 'track-1',
      },
      {
        scope: 'LocalSearch',
        getAudioBlob: vi.fn().mockResolvedValue(audioBlob),
        loadAudioBlob,
        setSubtitles,
        setPlaybackTrackId,
        applyStartedSurface,
        play,
        resolveArtwork: () => 'https://example.com/cover.jpg',
      }
    )

    expect(result).toEqual({ started: true, reason: 'started' })
    expect(loadAudioBlob).toHaveBeenCalledWith(
      audioBlob,
      'Local Session',
      'https://example.com/cover.jpg',
      'session-local-1',
      undefined,
      expect.objectContaining({
        durationSeconds: 30,
      })
    )
    expect(setSubtitles).toHaveBeenCalledWith([{ start: 0, end: 1, text: 'cue' }])
    expect(setPlaybackTrackId).toHaveBeenCalledWith('track-1')
    expect(applyStartedSurface).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('returns stale and skips ready-state side effects when superseded during blob restore', async () => {
    const loadAudioBlob = vi.fn().mockResolvedValue(undefined)
    const setSubtitles = vi.fn()
    const setPlaybackTrackId = vi.fn()
    const applyStartedSurface = vi.fn()
    const play = vi.fn()

    const result = await restoreLocalHistoryPlayback(
      {
        id: 'session-local-stale',
        source: 'local',
        title: 'Stale Session',
        createdAt: 1,
        lastPlayedAt: 1,
        sizeBytes: 0,
        durationSeconds: 30,
        audioId: 'audio-stale',
        subtitleId: null,
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'local.mp3',
        subtitleFilename: '',
        localTrackId: 'track-2',
      },
      {
        scope: 'History',
        getAudioBlob: vi.fn().mockImplementation(async () => {
          playbackEpoch += 1
          return new Blob(['audio'], { type: 'audio/mpeg' })
        }),
        loadAudioBlob,
        setSubtitles,
        setPlaybackTrackId,
        applyStartedSurface,
        play,
        resolveArtwork: () => null,
      }
    )

    expect(result).toEqual({ started: false, reason: 'stale' })
    expect(loadAudioBlob).not.toHaveBeenCalled()
    expect(setSubtitles).not.toHaveBeenCalled()
    expect(setPlaybackTrackId).not.toHaveBeenCalled()
    expect(applyStartedSurface).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })
})
