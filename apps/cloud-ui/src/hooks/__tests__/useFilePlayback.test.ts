import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRACK_SOURCE } from '../../lib/db/types'
import type { FileTrack } from '../../lib/dexieDb'
import { useFilePlayback } from '../useFilePlayback'

const navigateMock = vi.fn()
const prepareLocalFilePlaybackMock = vi.fn()
const persistLocalFilePlaybackSessionMock = vi.fn()
const updateFileTrackMock = vi.fn()
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

vi.mock('../../lib/player/localFilePlaybackService', () => ({
  LOCAL_FILE_PLAYBACK_PREPARE_REASON: {
    AUDIO_NOT_FOUND: 'audio_not_found',
  },
  prepareLocalFilePlayback: (...args: unknown[]) => prepareLocalFilePlaybackMock(...args),
  persistLocalFilePlaybackSession: (...args: unknown[]) =>
    persistLocalFilePlaybackSessionMock(...args),
}))

vi.mock('../../lib/repositories/FilesRepository', () => ({
  FilesRepository: {
    updateFileTrack: (...args: unknown[]) => updateFileTrackMock(...args),
  },
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
    prepareLocalFilePlaybackMock.mockResolvedValue({
      ok: true,
      payload: {
        audioBlob: new Blob(['audio']),
        artwork: null,
        subtitles: [],
        sessionId: 'local-track-track-1',
        metadata: {
          kind: 'local',
          durationSeconds: 225,
        },
        selectedSubtitleContentId: null,
      },
    })
    persistLocalFilePlaybackSessionMock.mockResolvedValue('local-track-track-1')
    updateFileTrackMock.mockResolvedValue(undefined)
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
        kind: 'local',
        durationSeconds: 225,
      })
    )
    expect(transcriptState.setSubtitles).toHaveBeenCalledWith([])
    expect(surfaceState.setPlayableContext).toHaveBeenCalledWith(true)
    expect(surfaceState.toDocked).toHaveBeenCalled()
    expect(playerState.play).toHaveBeenCalled()
    expect(persistLocalFilePlaybackSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        track,
        sessionId: 'local-track-track-1',
      })
    )
    expect(navigateMock).toHaveBeenCalledWith({ to: '/' })
  })

  it('updates the active subtitle through FilesRepository', async () => {
    const { result } = renderHook(() => useFilePlayback())

    await act(async () => {
      await result.current.handleSetActiveSubtitle('track-1', 'file-sub-2')
    })

    expect(updateFileTrackMock).toHaveBeenCalledWith('track-1', {
      activeSubtitleId: 'file-sub-2',
    })
  })
})
