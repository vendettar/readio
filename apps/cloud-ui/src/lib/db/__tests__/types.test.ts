import { describe, expect, it } from 'vitest'
import { isNavigableExplorePlaybackSession, type PlaybackSession } from '../types'

describe('db types guards', () => {
  it('rejects explore playback sessions with whitespace-only canonical navigation fields', () => {
    const session = {
      id: 'session-1',
      source: 'explore',
      title: 'Episode',
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      sizeBytes: 0,
      durationSeconds: 10,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 0,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/audio.mp3',
      artworkUrl: 'https://example.com/art.jpg',
      showTitle: 'Podcast',
      podcastItunesId: '   ',
      episodeGuid: '\n',
      countryAtSave: 'us',
    } satisfies PlaybackSession

    expect(isNavigableExplorePlaybackSession(session)).toBe(false)
  })
})
