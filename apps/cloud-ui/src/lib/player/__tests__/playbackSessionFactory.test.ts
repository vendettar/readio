import { describe, expect, it } from 'vitest'
import { TRACK_SOURCE } from '../../db/types'
import {
  createCanonicalRemoteEpisodeMetadata,
  createLocalEpisodeMetadata,
} from '../playbackMetadata'
import {
  buildLocalTrackPlaybackSessionCreateInput,
  buildManagedPlaybackSessionCreateInput,
  resolveSessionAudioSnapshot,
} from '../session/playbackSessionFactory'

describe('player/session/playbackSessionFactory', () => {
  it('builds managed explore session input with canonical country snapshot', () => {
    const input = buildManagedPlaybackSessionCreateInput({
      id: 'session-1',
      audioTitle: 'Episode',
      durationSeconds: 180,
      normalizedAudioUrl: 'https://cdn.example.com/audio.mp3',
      metadata: createCanonicalRemoteEpisodeMetadata({
        countryAtSave: 'us',
        showTitle: 'Show',
        description: 'Desc',
        artworkUrl: 'https://example.com/art.jpg',
        transcriptUrl: 'https://example.com/transcript.vtt',
        publishedAt: 123,
        episodeGuid: 'guid-1',
        podcastItunesId: '42',
      }),
    })

    expect(input).toEqual(
      expect.objectContaining({
        id: 'session-1',
        source: 'explore',
        audioUrl: 'https://cdn.example.com/audio.mp3',
        countryAtSave: 'us',
        title: 'Episode',
      })
    )
  })

  it('builds a local managed session input when metadata is absent', () => {
    const input = buildManagedPlaybackSessionCreateInput({
      id: 'session-2',
      audioTitle: 'Episode',
      durationSeconds: 180,
      normalizedAudioUrl: 'https://cdn.example.com/audio.mp3',
      metadata: null,
    })

    expect(input).toEqual(
      expect.objectContaining({
        id: 'session-2',
        source: 'local',
        audioUrl: 'https://cdn.example.com/audio.mp3',
      })
    )
  })

  it('rejects explore session input when canonical remote metadata has no playable audio url', () => {
    const input = buildManagedPlaybackSessionCreateInput({
      id: 'session-3',
      audioTitle: 'Episode',
      durationSeconds: 180,
      metadata: createCanonicalRemoteEpisodeMetadata({
        countryAtSave: 'us',
        showTitle: 'Show',
        artworkUrl: 'https://example.com/art.jpg',
        episodeGuid: 'guid-2',
        podcastItunesId: 'pod-2',
      }),
    })

    expect(input).toBeNull()
  })

  it('builds local track session input from a file track', () => {
    const input = buildLocalTrackPlaybackSessionCreateInput({
      sessionId: 'local-track-track-1',
      track: {
        id: 'track-1',
        name: 'Track',
        sourceType: TRACK_SOURCE.USER_UPLOAD,
        audioId: 'audio-1',
        sizeBytes: 100,
        createdAt: 1,
        folderId: null,
        album: 'Album',
        artist: 'Artist',
        durationSeconds: 245,
      },
      subtitleId: 'subtitle-1',
      artworkUrl: 'https://example.com/art.jpg',
    })

    expect(input).toEqual(
      expect.objectContaining({
        id: 'local-track-track-1',
        source: 'local',
        localTrackId: 'track-1',
        subtitleId: 'subtitle-1',
        artworkUrl: 'https://example.com/art.jpg',
        description: 'Album',
        showTitle: 'Artist',
        durationSeconds: 245,
      })
    )
  })

  it('prefers originalAudioUrl over blob urls for session identity', () => {
    expect(
      resolveSessionAudioSnapshot('blob:https://app.local/1', {
        originalAudioUrl: ' https://cdn.example.com/audio.mp3 ',
      })
    ).toBe('https://cdn.example.com/audio.mp3')
  })

  it('does not persist canonical remote identity onto local playback sessions', () => {
    const input = buildManagedPlaybackSessionCreateInput({
      id: 'session-local-metadata',
      audioTitle: 'Episode',
      durationSeconds: 180,
      normalizedAudioUrl: 'https://cdn.example.com/audio.mp3',
      metadata: createLocalEpisodeMetadata({
        showTitle: 'Show',
        artworkUrl: 'https://example.com/art.jpg',
      }),
    })

    expect(input).toEqual(
      expect.objectContaining({
        id: 'session-local-metadata',
        source: 'local',
        showTitle: 'Show',
        artworkUrl: 'https://example.com/art.jpg',
      })
    )
    expect(input).not.toHaveProperty('episodeGuid')
    expect(input).not.toHaveProperty('podcastItunesId')
    expect(input).not.toHaveProperty('countryAtSave')
  })
})
