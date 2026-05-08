import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRACK_SOURCE } from '../../db/types'
import type { FileSubtitle, FileTrack } from '../../dexieDb'
import { FilesRepository } from '../../repositories/FilesRepository'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'
import {
  LOCAL_FILE_PLAYBACK_PREPARE_REASON,
  persistLocalFilePlaybackSession,
  prepareLocalFilePlayback,
} from '../localFilePlaybackService'

vi.mock('../../repositories/FilesRepository', () => ({
  FilesRepository: {
    getAudioBlob: vi.fn(),
    resolveTrackArtwork: vi.fn(),
  },
}))

vi.mock('../../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getSubtitle: vi.fn(),
    upsertPlaybackSession: vi.fn(),
  },
}))

function makeTrack(overrides: Partial<FileTrack> = {}): FileTrack {
  return {
    id: 'track-1',
    folderId: null,
    name: 'Track 1',
    audioId: 'audio-1',
    sizeBytes: 1234,
    durationSeconds: 225,
    createdAt: 1,
    sourceType: TRACK_SOURCE.USER_UPLOAD,
    ...overrides,
  }
}

describe('localFilePlaybackService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns audio-not-found when the local track blob is missing', async () => {
    vi.mocked(FilesRepository.getAudioBlob).mockResolvedValue(undefined)

    const prepared = await prepareLocalFilePlayback({
      track: makeTrack(),
      availableSubtitles: [],
    })

    expect(prepared).toEqual({
      ok: false,
      reason: LOCAL_FILE_PLAYBACK_PREPARE_REASON.AUDIO_NOT_FOUND,
    })
  })

  it('loads artwork and prefers the active track subtitle', async () => {
    const subtitleA: FileSubtitle = {
      id: 'file-sub-a',
      trackId: 'track-1',
      subtitleId: 'subtitle-a',
      name: 'A',
      createdAt: 1,
      sourceKind: 'manual_upload',
      status: 'ready',
    }
    const subtitleB: FileSubtitle = {
      id: 'file-sub-b',
      trackId: 'track-1',
      subtitleId: 'subtitle-b',
      name: 'B',
      createdAt: 2,
      sourceKind: 'manual_upload',
      status: 'ready',
    }

    vi.mocked(FilesRepository.getAudioBlob).mockResolvedValue({
      id: 'audio-1',
      blob: new Blob(['audio']),
      filename: 'track.mp3',
      size: 5,
      type: 'audio/mpeg',
      storedAt: 1,
    })
    vi.mocked(FilesRepository.resolveTrackArtwork).mockResolvedValue(new Blob(['art']))
    vi.mocked(PlaybackRepository.getSubtitle).mockResolvedValue({
      id: 'subtitle-b',
      cues: [{ start: 0, end: 1, text: 'Hello' }],
      cueSchemaVersion: 1,
      size: 1,
      filename: 'sub.vtt',
      storedAt: 1,
    })

    const prepared = await prepareLocalFilePlayback({
      track: makeTrack({ activeSubtitleId: 'file-sub-b', artist: 'Artist', album: 'Album' }),
      availableSubtitles: [subtitleA, subtitleB],
    })

    expect(prepared).toEqual({
      ok: true,
      payload: expect.objectContaining({
        artwork: expect.any(Blob),
        subtitles: [{ start: 0, end: 1, text: 'Hello' }],
        sessionId: 'local-track-track-1',
        selectedSubtitleContentId: 'subtitle-b',
        metadata: expect.objectContaining({
          kind: 'local',
          showTitle: 'Artist',
          description: 'Album',
          durationSeconds: 225,
        }),
      }),
    })
  })

  it('persists the local playback session through PlaybackRepository', async () => {
    vi.mocked(PlaybackRepository.upsertPlaybackSession).mockResolvedValue('local-track-track-1')

    const result = await persistLocalFilePlaybackSession({
      track: makeTrack(),
      sessionId: 'local-track-track-1',
      selectedSubtitleContentId: 'subtitle-b',
      artwork: null,
    })

    expect(result).toBe('local-track-track-1')
    expect(PlaybackRepository.upsertPlaybackSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'local-track-track-1',
        localTrackId: 'track-1',
        subtitleId: 'subtitle-b',
      })
    )
  })
})
