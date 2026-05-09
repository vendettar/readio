import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import type { PlaybackSession } from '../../db/types'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'
import { createCanonicalRemoteEpisodeMetadata } from '../playbackMetadata'
import {
  resolveCurrentPlaybackRestoreTarget,
  restorePlaybackProgressForTarget,
} from '../session/playerSessionRuntime'

vi.mock('../../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getPlaybackSession: vi.fn(),
  },
}))

describe('playerSessionRuntime', () => {
  function expectCanonicalRemoteMetadata(
    metadata: ReturnType<typeof createCanonicalRemoteEpisodeMetadata>
  ) {
    expect(metadata).not.toBeNull()
    return metadata
  }

  beforeEach(() => {
    vi.clearAllMocks()
    usePlayerStore.setState({
      sessionId: null,
      audioUrl: null,
      episodeMetadata: null,
      progress: 0,
      duration: 0,
    })
  })

  it('prevents stale progress restoration when the active session identity has changed during the async fetch', async () => {
    let resolvePlaybackSession: ((value: PlaybackSession | undefined) => void) | undefined
    const mockSessionFetch = new Promise<PlaybackSession | undefined>((resolve) => {
      resolvePlaybackSession = resolve
    })

    vi.mocked(PlaybackRepository.getPlaybackSession).mockReturnValue(mockSessionFetch)

    usePlayerStore.setState({
      sessionId: 'restore-session-stale',
      audioUrl: 'https://example.com/old.mp3',
      episodeMetadata: expectCanonicalRemoteMetadata(
        createCanonicalRemoteEpisodeMetadata({
          showTitle: 'Podcast Old',
          artworkUrl: 'https://example.com/old.jpg',
          episodeGuid: 'guid-old',
          podcastItunesId: 'pod-old',
          countryAtSave: 'us',
        })
      ),
    })

    const target = resolveCurrentPlaybackRestoreTarget()
    expect(target).not.toBeNull()
    if (!target) {
      throw new Error('expected restore target')
    }
    const audio = document.createElement('audio')
    audio.src = 'https://example.com/old.mp3'

    const restorePromise = restorePlaybackProgressForTarget({
      audioElement: audio,
      target,
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
      source: 'explore',
      title: 'Track',
      createdAt: 0,
      lastPlayedAt: 0,
      sizeBytes: 0,
      progress: 180,
      durationSeconds: 300,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/old.mp3',
      artworkUrl: 'https://example.com/old.jpg',
      showTitle: 'Podcast Old',
      episodeGuid: 'guid-old',
      podcastItunesId: 'pod-old',
      countryAtSave: 'us',
    })

    await restorePromise

    expect(audio.currentTime).toBe(0)
    expect(usePlayerStore.getState().progress).toBe(0)
  })
})
