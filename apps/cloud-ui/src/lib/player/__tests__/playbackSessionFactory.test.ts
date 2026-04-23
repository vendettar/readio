import { describe, expect, it } from 'vitest'
import { TRACK_SOURCE } from '../../db/types'
import {
  buildLocalTrackPlaybackSessionCreateInput,
  buildManagedPlaybackSessionCreateInput,
  resolveSessionAudioSnapshot,
} from '../playbackSessionFactory'

describe('playbackSessionFactory', () => {
  it('builds managed explore session input with normalized feed and country', () => {
    const input = buildManagedPlaybackSessionCreateInput({
      id: 'session-1',
      audioTitle: 'Episode',
      durationSeconds: 180,
      normalizedAudioUrl: 'https://cdn.example.com/audio.mp3',
      metadata: {
        countryAtSave: 'US',
        podcastFeedUrl: ' HTTPS://Example.COM:443/feed.xml#frag ',
        showTitle: 'Show',
        description: 'Desc',
        artworkUrl: 'https://example.com/art.jpg',
        transcriptUrl: 'https://example.com/transcript.vtt',
        publishedAt: 123,
        episodeGuid: 'guid-1',
        podcastItunesId: '42',
      },
    })

    expect(input).toEqual(
      expect.objectContaining({
        id: 'session-1',
        source: 'explore',
        audioUrl: 'https://cdn.example.com/audio.mp3',
        podcastFeedUrl: 'https://example.com/feed.xml',
        countryAtSave: 'us',
        title: 'Episode',
      })
    )
  })

  it('rejects explore session input when countryAtSave is invalid', () => {
    const input = buildManagedPlaybackSessionCreateInput({
      id: 'session-2',
      audioTitle: 'Episode',
      durationSeconds: 180,
      metadata: {
        countryAtSave: 'zz',
      },
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
        podcastTitle: 'Artist',
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
})
