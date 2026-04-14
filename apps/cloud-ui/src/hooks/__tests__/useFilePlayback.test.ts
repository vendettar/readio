import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRACK_SOURCE } from '../../lib/db/types'
import type { FileTrack } from '../../lib/dexieDb'
import { useFilePlayback } from '../useFilePlayback'

const navigateMock = vi.fn()
const getAudioBlobMock = vi.fn()
const upsertPlaybackSessionMock = vi.fn()
const parseSubtitlesMock = vi.fn()
const logErrorMock = vi.fn()
const logWarnMock = vi.fn()

const playerState = {
  loadAudioBlob: vi.fn(),
  play: vi.fn(),
  setPlaybackTrackId: vi.fn(),
}

const transcriptState = {
  setSubtitles: vi.fn(),
}

const surfaceState = {
  setPlayableContext: vi.fn(),
  toDocked: vi.fn(),
}

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: navigateMock }),
}))

vi.mock('../../lib/dexieDb', () => ({
  DB: {
    getAudioBlob: (...args: unknown[]) => getAudioBlobMock(...args),
    upsertPlaybackSession: (...args: unknown[]) => upsertPlaybackSessionMock(...args),
  },
}))

vi.mock('../../lib/subtitles', () => ({
  parseSubtitles: (...args: unknown[]) => parseSubtitlesMock(...args),
}))

vi.mock('../../lib/logger', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
  warn: (...args: unknown[]) => logWarnMock(...args),
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: {
    getState: () => playerState,
  },
}))

vi.mock('../../store/transcriptStore', () => ({
  useTranscriptStore: {
    getState: () => transcriptState,
  },
}))

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: {
    getState: () => surfaceState,
  },
}))

describe('useFilePlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAudioBlobMock.mockResolvedValue({ blob: new Blob(['audio']), id: 'audio-1', storedAt: 1 })
    upsertPlaybackSessionMock.mockResolvedValue(undefined)
  })

  it('enters docked mode for local file playback even when subtitles are absent', async () => {
    const { result } = renderHook(() => useFilePlayback())
    const track: FileTrack = {
      id: 'track-1',
      folderId: null,
      name: 'No Subtitle Track',
      audioId: 'audio-1',
      sizeBytes: 1234,
      durationSeconds: 225,
      createdAt: 1,
      sourceType: TRACK_SOURCE.USER_UPLOAD,
    }

    await act(async () => {
      await result.current.handlePlay(track, [], undefined)
    })

    expect(playerState.loadAudioBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      track.name,
      null,
      'local-track-track-1',
      undefined,
      expect.objectContaining({
        durationSeconds: 225,
      })
    )
    expect(transcriptState.setSubtitles).toHaveBeenCalledWith([])
    expect(parseSubtitlesMock).not.toHaveBeenCalled()
    expect(surfaceState.setPlayableContext).toHaveBeenCalledWith(true)
    expect(surfaceState.toDocked).toHaveBeenCalled()
    expect(playerState.play).toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith({ to: '/' })
  })
})
