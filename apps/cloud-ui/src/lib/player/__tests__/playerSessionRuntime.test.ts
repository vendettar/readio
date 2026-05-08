import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'
import {
  applyExistingManagedPlaybackSession,
  resolveCurrentPlaybackRestoreTarget,
  restorePlaybackProgressForTarget,
} from '../playerSessionRuntime'

vi.mock('../../logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

vi.mock('../../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getPlaybackSession: vi.fn(),
    updatePlaybackSession: vi.fn(),
  },
}))

describe('playerSessionRuntime', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset()
    vi.clearAllMocks()
  })

  it('applies an existing managed session into player runtime state', () => {
    const seekToSpy = vi.spyOn(usePlayerStore.getState(), 'seekTo')

    applyExistingManagedPlaybackSession({
      id: 'existing-session',
      progress: 45.5,
      durationSeconds: 100,
    })

    expect(usePlayerStore.getState().sessionId).toBe('existing-session')
    expect(usePlayerStore.getState().progress).toBe(45.5)
    expect(usePlayerStore.getState().duration).toBe(100)
    expect(seekToSpy).toHaveBeenCalledWith(45.5)

    seekToSpy.mockRestore()
  })

  it('builds a restore target from current canonical playback identity', () => {
    usePlayerStore.setState({
      sessionId: 'restore-session',
      audioUrl: 'https://example.com/audio.mp3',
      episodeMetadata: {
        kind: 'remote-episode',
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        episodeGuid: 'episode-1',
        podcastItunesId: 'podcast-1',
        countryAtSave: 'us',
      },
    })

    expect(resolveCurrentPlaybackRestoreTarget()).toEqual({
      sessionId: 'restore-session',
      playbackIdentity: 'podcast:podcast-1:episode:episode-1:country:us',
      restoreKey: 'restore-session::podcast:podcast-1:episode:episode-1:country:us',
    })
  })

  it('ignores stale restore results when playback target changes before fetch resolves', async () => {
    usePlayerStore.setState({
      sessionId: 'restore-session-stale',
      audioUrl: 'https://example.com/old.mp3',
      progress: 0,
    })

    let resolvePlaybackSession:
      | ((value: {
          id: string
          progress: number
          durationSeconds: number
          source: 'local'
          title: string
          createdAt: number
          lastPlayedAt: number
          sizeBytes: number
          audioId: null
          subtitleId: null
          hasAudioBlob: false
          audioFilename: string
          subtitleFilename: string
        }) => void)
      | undefined

    vi.mocked(PlaybackRepository.getPlaybackSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePlaybackSession = resolve as typeof resolvePlaybackSession
        })
    )

    const target = resolveCurrentPlaybackRestoreTarget()
    expect(target).not.toBeNull()
    const audio = document.createElement('audio')
    audio.src = 'https://example.com/old.mp3'

    const restorePromise = restorePlaybackProgressForTarget({
      audioElement: audio,
      target: target!,
      restoreInFlight: new Set(),
      restoreApplied: new Map(),
      completedRestoreThresholdSeconds: 2,
      setProgress: usePlayerStore.getState().setProgress,
    })

    usePlayerStore.setState({
      sessionId: 'restore-session-new',
      audioUrl: 'https://example.com/new.mp3',
    })

    resolvePlaybackSession?.({
      id: 'restore-session-stale',
      progress: 180,
      durationSeconds: 300,
      source: 'local',
      title: 'Track',
      createdAt: 0,
      lastPlayedAt: 0,
      sizeBytes: 0,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      audioFilename: '',
      subtitleFilename: '',
    })

    await restorePromise

    expect(audio.currentTime).toBe(0)
    expect(usePlayerStore.getState().progress).toBe(0)
  })
})
