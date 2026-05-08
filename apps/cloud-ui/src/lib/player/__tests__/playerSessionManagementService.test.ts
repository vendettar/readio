import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackSession } from '../../dexieDb'
import {
  CREATE_MANAGED_PLAYBACK_SESSION_REASON,
  createManagedPlaybackSession,
  findManagedPlaybackSessionCandidate,
} from '../playerSessionManagementService'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'

vi.mock('../../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getPlaybackSession: vi.fn(),
    findLastSessionByTrackId: vi.fn(),
    findLastExploreSessionByCanonicalIdentity: vi.fn(),
    findLastSessionByUrl: vi.fn(),
    upsertPlaybackSession: vi.fn(),
  },
}))

vi.mock('../../session', () => ({
  generateSessionId: vi.fn(() => 'managed-session-1'),
}))

function makeLocalSession(id: string): PlaybackSession {
  return {
    id,
    source: 'local',
    title: 'Local Track',
    createdAt: 1,
    lastPlayedAt: 1,
    sizeBytes: 0,
    durationSeconds: 120,
    audioId: null,
    subtitleId: null,
    hasAudioBlob: false,
    progress: 12,
    audioFilename: '',
    subtitleFilename: '',
  }
}

describe('playerSessionManagementService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers the direct local-track session before fallback lookup', async () => {
    vi.mocked(PlaybackRepository.getPlaybackSession).mockResolvedValue(
      makeLocalSession('local-track-track-1')
    )

    const session = await findManagedPlaybackSessionCandidate({
      localTrackId: 'track-1',
    })

    expect(PlaybackRepository.getPlaybackSession).toHaveBeenCalledWith('local-track-track-1')
    expect(PlaybackRepository.findLastSessionByTrackId).not.toHaveBeenCalled()
    expect(session?.id).toBe('local-track-track-1')
  })

  it('uses canonical remote identity before audio-url fallback', async () => {
    await findManagedPlaybackSessionCandidate({
      metadata: {
        kind: 'remote-episode',
        countryAtSave: 'us',
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        episodeGuid: 'episode-guid-1',
        podcastItunesId: 'podcast-1',
      },
      audioUrl: 'https://example.com/audio.mp3',
    })

    expect(PlaybackRepository.findLastExploreSessionByCanonicalIdentity).toHaveBeenCalledWith(
      'podcast-1',
      'episode-guid-1'
    )
    expect(PlaybackRepository.findLastSessionByUrl).not.toHaveBeenCalled()
  })

  it('creates a managed playback session for canonical remote metadata', async () => {
    vi.mocked(PlaybackRepository.upsertPlaybackSession).mockResolvedValue('managed-session-1')

    const result = await createManagedPlaybackSession({
      audioTitle: 'Episode Title',
      durationSeconds: 245,
      audioUrl: 'https://example.com/audio.mp3',
      metadata: {
        kind: 'remote-episode',
        countryAtSave: 'us',
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        episodeGuid: 'episode-guid-1',
        podcastItunesId: 'podcast-1',
      },
    })

    expect(result).toEqual({
      ok: true,
      sessionId: 'managed-session-1',
    })
    expect(PlaybackRepository.upsertPlaybackSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'managed-session-1',
        source: 'explore',
        countryAtSave: 'us',
      })
    )
  })

  it('rejects invalid remote metadata when creating a managed session', async () => {
    const result = await createManagedPlaybackSession({
      audioTitle: 'Episode Title',
      durationSeconds: 245,
      audioUrl: 'https://example.com/audio.mp3',
      metadata: {
        kind: 'remote-episode',
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        episodeGuid: 'episode-guid-1',
        podcastItunesId: 'podcast-1',
      } as never,
    })

    expect(result).toEqual({
      ok: false,
      reason: CREATE_MANAGED_PLAYBACK_SESSION_REASON.INVALID_REMOTE_METADATA,
    })
  })
})
